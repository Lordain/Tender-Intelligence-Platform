-- New monthly plans, one-country basic access and an atomic five-detail
-- allowance for signed-in free accounts.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan in ('explorer', 'basic', 'professional', 'enterprise'));
alter table public.subscriptions drop constraint if exists subscriptions_billing_interval_check;
alter table public.subscriptions add constraint subscriptions_billing_interval_check check (billing_interval = 'monthly');
alter table public.manual_payment_requests drop constraint if exists manual_payment_requests_plan_check;
alter table public.manual_payment_requests add constraint manual_payment_requests_plan_check
  check (plan in ('basic', 'professional', 'enterprise'));
alter table public.manual_payment_requests drop constraint if exists manual_payment_requests_billing_interval_check;
alter table public.manual_payment_requests add constraint manual_payment_requests_billing_interval_check
  check (billing_interval = 'monthly');

create or replace function public.activate_manual_subscription(
  p_user_id uuid, p_plan text, p_billing_interval text, p_admin_user_id uuid, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  live_stripe uuid;
  subscription_id uuid;
  period_start timestamptz := now();
  period_end timestamptz := now() + interval '1 month';
begin
  if p_plan not in ('basic', 'professional', 'enterprise') then raise exception 'invalid plan'; end if;
  if p_billing_interval <> 'monthly' then raise exception 'invalid billing interval'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select id into live_stripe from public.subscriptions
  where user_id = p_user_id and status in ('active', 'trialing') and stripe_subscription_id is not null limit 1;
  if live_stripe is not null then raise exception 'customer already has a live Stripe subscription'; end if;
  update public.subscriptions set status = 'cancelled', canceled_at = now(), cancel_at_period_end = false
  where user_id = p_user_id and status in ('active', 'trialing') and stripe_subscription_id is null;
  insert into public.subscriptions(user_id, plan, status, current_period_start, current_period_end, cancel_at_period_end, billing_interval, payment_source)
  values(p_user_id, p_plan, 'active', period_start, period_end, false, 'monthly', 'manual') returning id into subscription_id;
  update public.manual_payment_requests set status = 'cancelled', reviewed_by = p_admin_user_id,
    reviewed_at = now(), review_note = '由管理员直接开通订阅', updated_at = now()
  where user_id = p_user_id and status in ('pending', 'proof_submitted');
  update public.billing_profiles set pending_payment_request_id = null, pending_payment_kind = null,
    pending_payment_reference_id = null, pending_payment_url = null, pending_payment_expires_at = null, updated_at = now()
  where user_id = p_user_id and pending_payment_kind = 'international_wire';
  insert into public.billing_admin_audit_log(admin_user_id, target_user_id, subscription_id, action, note, details)
  values(p_admin_user_id, p_user_id, subscription_id, 'manual_subscription_activated', nullif(trim(p_note), ''),
    jsonb_build_object('plan', p_plan, 'billing_interval', 'monthly', 'period_end', period_end));
  return subscription_id;
end;
$$;

alter table public.profiles alter column trial_ends_at set default (now() + interval '7 days');
update public.profiles
set trial_ends_at = created_at + interval '7 days'
where trial_ends_at < created_at + interval '7 days';

create table public.basic_plan_countries (
  subscription_id uuid primary key references public.subscriptions(id) on delete cascade,
  country text not null check (country in ('Mexico', 'Brazil', 'Colombia', 'Peru')),
  selected_at timestamptz not null default now()
);
alter table public.basic_plan_countries enable row level security;
revoke all on public.basic_plan_countries from anon, authenticated;
grant all on public.basic_plan_countries to service_role;

create table public.free_tender_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  tender_id uuid not null references public.tenders(id) on delete cascade,
  month_start date not null,
  viewed_at timestamptz not null default now(),
  primary key (user_id, tender_id, month_start)
);
create index free_tender_views_month_idx on public.free_tender_views(user_id, month_start);
alter table public.free_tender_views enable row level security;
revoke all on public.free_tender_views from anon, authenticated;
grant all on public.free_tender_views to service_role;

create or replace function public.claim_free_tender_view(p_user_id uuid, p_tender_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  current_month date := date_trunc('month', now() at time zone 'America/Mexico_City')::date;
  used_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || current_month::text, 0));
  if exists (select 1 from public.free_tender_views where user_id = p_user_id and tender_id = p_tender_id and month_start = current_month) then
    return true;
  end if;
  select count(*) into used_count from public.free_tender_views where user_id = p_user_id and month_start = current_month;
  if used_count >= 5 then return false; end if;
  insert into public.free_tender_views(user_id, tender_id, month_start) values(p_user_id, p_tender_id, current_month);
  return true;
end;
$$;
revoke all on function public.claim_free_tender_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_free_tender_view(uuid, uuid) to service_role;
