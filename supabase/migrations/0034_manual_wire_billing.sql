-- Manual international wire billing, deliberately separate from Stripe.
-- A customer request never grants access: only an authenticated admin action
-- can approve cleared funds and create/renew a manual subscription.

alter table public.subscriptions
  add column if not exists payment_source text not null default 'manual';

update public.subscriptions
set payment_source = 'stripe'
where stripe_subscription_id is not null;

alter table public.subscriptions drop constraint if exists subscriptions_payment_source_check;
alter table public.subscriptions add constraint subscriptions_payment_source_check
  check (payment_source in ('stripe', 'manual'));

alter table public.billing_profiles drop constraint if exists billing_profiles_pending_payment_kind_check;
alter table public.billing_profiles add constraint billing_profiles_pending_payment_kind_check
  check (pending_payment_kind in ('card', 'bank_transfer', 'international_wire'));

create table if not exists public.manual_payment_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('professional', 'enterprise')),
  billing_interval text not null check (billing_interval in ('monthly', 'semiannual', 'annual')),
  currency text not null default 'USD' check (currency = 'USD'),
  amount_minor integer not null check (amount_minor > 0),
  status text not null default 'pending'
    check (status in ('pending', 'proof_submitted', 'paid', 'rejected', 'expired', 'cancelled')),
  sender_name text,
  sender_bank text,
  sender_reference text,
  sent_at timestamptz,
  customer_note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manual_payment_requests_user_idx
  on public.manual_payment_requests (user_id, created_at desc);
create index if not exists manual_payment_requests_review_idx
  on public.manual_payment_requests (status, created_at asc);
create unique index if not exists manual_payment_requests_one_open_per_user_idx
  on public.manual_payment_requests (user_id)
  where status in ('pending', 'proof_submitted');

create table if not exists public.billing_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  manual_payment_request_id uuid references public.manual_payment_requests (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  action text not null,
  note text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists billing_admin_audit_target_idx
  on public.billing_admin_audit_log (target_user_id, created_at desc);

alter table public.manual_payment_requests enable row level security;
alter table public.billing_admin_audit_log enable row level security;

create policy "Users can view their own manual payment requests"
  on public.manual_payment_requests for select
  using (auth.uid() = user_id);

-- No browser write policies. Creation and every administrative mutation run
-- through authenticated server routes using the service role.

create or replace function public.approve_manual_payment(
  p_request_id uuid,
  p_admin_user_id uuid,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  payment public.manual_payment_requests%rowtype;
  live_stripe uuid;
  subscription_id uuid;
  period_start timestamptz := now();
  period_end timestamptz;
begin
  select * into payment
  from public.manual_payment_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'manual payment request not found'; end if;
  if payment.status not in ('pending', 'proof_submitted') then
    raise exception 'manual payment request is not awaiting review';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(payment.user_id::text, 0));
  select id into live_stripe
  from public.subscriptions
  where user_id = payment.user_id
    and status in ('active', 'trialing')
    and stripe_subscription_id is not null
  limit 1;
  if live_stripe is not null then
    raise exception 'customer already has a live Stripe subscription';
  end if;

  period_end := case payment.billing_interval
    when 'monthly' then period_start + interval '1 month'
    when 'semiannual' then period_start + interval '6 months'
    else period_start + interval '1 year'
  end;

  update public.subscriptions
  set status = 'cancelled', canceled_at = now(), cancel_at_period_end = false
  where user_id = payment.user_id
    and status in ('active', 'trialing')
    and stripe_subscription_id is null;

  insert into public.subscriptions (
    user_id, plan, status, current_period_start, current_period_end,
    cancel_at_period_end, billing_interval, payment_source
  ) values (
    payment.user_id, payment.plan, 'active', period_start, period_end,
    false, payment.billing_interval, 'manual'
  ) returning id into subscription_id;

  update public.manual_payment_requests
  set status = 'paid', reviewed_by = p_admin_user_id, reviewed_at = now(),
      review_note = nullif(trim(p_note), ''), updated_at = now()
  where id = payment.id;

  update public.billing_profiles
  set pending_payment_request_id = null, pending_payment_kind = null,
      pending_payment_reference_id = null, pending_payment_url = null,
      pending_payment_expires_at = null, updated_at = now()
  where user_id = payment.user_id
    and pending_payment_request_id = payment.id;

  insert into public.billing_admin_audit_log (
    admin_user_id, target_user_id, manual_payment_request_id,
    subscription_id, action, note, details
  ) values (
    p_admin_user_id, payment.user_id, payment.id, subscription_id,
    'manual_payment_approved', nullif(trim(p_note), ''),
    jsonb_build_object('reference', payment.reference, 'amount_minor', payment.amount_minor,
      'currency', payment.currency, 'plan', payment.plan, 'billing_interval', payment.billing_interval,
      'period_end', period_end)
  );

  return subscription_id;
end;
$$;

revoke all on function public.approve_manual_payment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_manual_payment(uuid, uuid, text) to service_role;

create or replace function public.activate_manual_subscription(
  p_user_id uuid,
  p_plan text,
  p_billing_interval text,
  p_admin_user_id uuid,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  live_stripe uuid;
  subscription_id uuid;
  period_start timestamptz := now();
  period_end timestamptz;
begin
  if p_plan not in ('professional', 'enterprise') then raise exception 'invalid plan'; end if;
  if p_billing_interval not in ('monthly', 'semiannual', 'annual') then raise exception 'invalid billing interval'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select id into live_stripe from public.subscriptions
  where user_id = p_user_id and status in ('active', 'trialing') and stripe_subscription_id is not null limit 1;
  if live_stripe is not null then raise exception 'customer already has a live Stripe subscription'; end if;

  period_end := case p_billing_interval
    when 'monthly' then period_start + interval '1 month'
    when 'semiannual' then period_start + interval '6 months'
    else period_start + interval '1 year'
  end;
  update public.subscriptions set status = 'cancelled', canceled_at = now(), cancel_at_period_end = false
  where user_id = p_user_id and status in ('active', 'trialing') and stripe_subscription_id is null;
  insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end, cancel_at_period_end, billing_interval, payment_source)
  values (p_user_id, p_plan, 'active', period_start, period_end, false, p_billing_interval, 'manual')
  returning id into subscription_id;

  update public.manual_payment_requests set status = 'cancelled', reviewed_by = p_admin_user_id,
    reviewed_at = now(), review_note = '由管理员直接开通订阅', updated_at = now()
  where user_id = p_user_id and status in ('pending', 'proof_submitted');
  update public.billing_profiles set pending_payment_request_id = null, pending_payment_kind = null,
    pending_payment_reference_id = null, pending_payment_url = null, pending_payment_expires_at = null, updated_at = now()
  where user_id = p_user_id and pending_payment_kind = 'international_wire';

  insert into public.billing_admin_audit_log (admin_user_id, target_user_id, subscription_id, action, note, details)
  values (p_admin_user_id, p_user_id, subscription_id, 'manual_subscription_activated', nullif(trim(p_note), ''),
    jsonb_build_object('plan', p_plan, 'billing_interval', p_billing_interval, 'period_end', period_end));
  return subscription_id;
end;
$$;

revoke all on function public.activate_manual_subscription(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.activate_manual_subscription(uuid, text, text, uuid, text) to service_role;

create or replace function public.manage_manual_subscription(
  p_subscription_id uuid,
  p_action text,
  p_admin_user_id uuid,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription public.subscriptions%rowtype;
  new_end timestamptz;
begin
  select * into subscription from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'subscription not found'; end if;
  if subscription.stripe_subscription_id is not null or subscription.payment_source <> 'manual' then
    raise exception 'Stripe subscriptions must be managed in Stripe';
  end if;
  if p_action not in ('cancel_now', 'cancel_period_end', 'resume', 'extend') then raise exception 'invalid action'; end if;

  if p_action = 'cancel_now' then
    update public.subscriptions set status = 'cancelled', canceled_at = now(), cancel_at_period_end = false, current_period_end = now() where id = p_subscription_id;
  elsif p_action = 'cancel_period_end' then
    update public.subscriptions set cancel_at_period_end = true where id = p_subscription_id;
  elsif p_action = 'resume' then
    if subscription.current_period_end is not null and subscription.current_period_end <= now() then
      raise exception 'expired subscriptions must be extended instead of resumed';
    end if;
    update public.subscriptions set status = 'active', canceled_at = null, cancel_at_period_end = false where id = p_subscription_id;
  else
    new_end := greatest(coalesce(subscription.current_period_end, now()), now()) + case subscription.billing_interval
      when 'monthly' then interval '1 month' when 'semiannual' then interval '6 months' else interval '1 year' end;
    update public.subscriptions set status = 'active', canceled_at = null, cancel_at_period_end = false, current_period_end = new_end where id = p_subscription_id;
  end if;

  insert into public.billing_admin_audit_log (admin_user_id, target_user_id, subscription_id, action, note, details)
  values (p_admin_user_id, subscription.user_id, subscription.id, 'manual_subscription_' || p_action,
    nullif(trim(p_note), ''), jsonb_build_object('previous_status', subscription.status, 'previous_period_end', subscription.current_period_end, 'new_period_end', new_end));
end;
$$;

revoke all on function public.manage_manual_subscription(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.manage_manual_subscription(uuid, text, uuid, text) to service_role;

create or replace function public.reject_manual_payment(
  p_request_id uuid,
  p_admin_user_id uuid,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare payment public.manual_payment_requests%rowtype;
begin
  select * into payment from public.manual_payment_requests where id = p_request_id for update;
  if not found then raise exception 'manual payment request not found'; end if;
  if payment.status not in ('pending', 'proof_submitted') then raise exception 'manual payment request is not awaiting review'; end if;
  if nullif(trim(p_note), '') is null then raise exception 'rejection note is required'; end if;
  update public.manual_payment_requests set status = 'rejected', reviewed_by = p_admin_user_id,
    reviewed_at = now(), review_note = trim(p_note), updated_at = now() where id = payment.id;
  update public.billing_profiles set pending_payment_request_id = null, pending_payment_kind = null,
    pending_payment_reference_id = null, pending_payment_url = null, pending_payment_expires_at = null, updated_at = now()
  where user_id = payment.user_id and pending_payment_request_id = payment.id;
  insert into public.billing_admin_audit_log (admin_user_id, target_user_id, manual_payment_request_id, action, note, details)
  values (p_admin_user_id, payment.user_id, payment.id, 'manual_payment_rejected', trim(p_note), jsonb_build_object('reference', payment.reference));
end;
$$;

revoke all on function public.reject_manual_payment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reject_manual_payment(uuid, uuid, text) to service_role;
