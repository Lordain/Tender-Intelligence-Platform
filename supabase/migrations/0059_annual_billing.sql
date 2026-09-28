-- Annual plans: twelve months for the price of ten (2026-09-28).
--
-- 0055 narrowed billing_interval to 'monthly' on both billing tables and in
-- the admin activation function. This widens all three to monthly or annual.
-- approve_manual_payment (0034) and the extension/undo functions (0035)
-- already give 'annual' a one-year period and need no change.
-- Only constraints and one function change; no row is rewritten.

alter table public.subscriptions drop constraint if exists subscriptions_billing_interval_check;
alter table public.subscriptions add constraint subscriptions_billing_interval_check
  check (billing_interval in ('monthly', 'annual'));

alter table public.manual_payment_requests drop constraint if exists manual_payment_requests_billing_interval_check;
alter table public.manual_payment_requests add constraint manual_payment_requests_billing_interval_check
  check (billing_interval in ('monthly', 'annual'));

create or replace function public.activate_manual_subscription(
  p_user_id uuid, p_plan text, p_billing_interval text, p_admin_user_id uuid, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  live_stripe uuid;
  subscription_id uuid;
  period_start timestamptz := now();
  period_end timestamptz;
begin
  if p_plan not in ('basic', 'professional', 'enterprise') then raise exception 'invalid plan'; end if;
  if p_billing_interval not in ('monthly', 'annual') then raise exception 'invalid billing interval'; end if;
  period_end := case p_billing_interval when 'annual' then period_start + interval '1 year' else period_start + interval '1 month' end;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select id into live_stripe from public.subscriptions
  where user_id = p_user_id and status in ('active', 'trialing') and stripe_subscription_id is not null limit 1;
  if live_stripe is not null then raise exception 'customer already has a live Stripe subscription'; end if;
  update public.subscriptions set status = 'cancelled', canceled_at = now(), cancel_at_period_end = false
  where user_id = p_user_id and status in ('active', 'trialing') and stripe_subscription_id is null;
  insert into public.subscriptions(user_id, plan, status, current_period_start, current_period_end, cancel_at_period_end, billing_interval, payment_source)
  values(p_user_id, p_plan, 'active', period_start, period_end, false, p_billing_interval, 'manual') returning id into subscription_id;
  update public.manual_payment_requests set status = 'cancelled', reviewed_by = p_admin_user_id,
    reviewed_at = now(), review_note = '由管理员直接开通订阅', updated_at = now()
  where user_id = p_user_id and status in ('pending', 'proof_submitted');
  update public.billing_profiles set pending_payment_request_id = null, pending_payment_kind = null,
    pending_payment_reference_id = null, pending_payment_url = null, pending_payment_expires_at = null, updated_at = now()
  where user_id = p_user_id and pending_payment_kind = 'international_wire';
  insert into public.billing_admin_audit_log(admin_user_id, target_user_id, subscription_id, action, note, details)
  values(p_admin_user_id, p_user_id, subscription_id, 'manual_subscription_activated', nullif(trim(p_note), ''),
    jsonb_build_object('plan', p_plan, 'billing_interval', p_billing_interval, 'period_end', period_end));
  return subscription_id;
end;
$$;
