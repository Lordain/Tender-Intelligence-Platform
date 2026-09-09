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
    nullif(trim(p_note), ''), jsonb_build_object(
      'previous_status', subscription.status,
      'previous_period_end', subscription.current_period_end,
      'previous_canceled_at', subscription.canceled_at,
      'previous_cancel_at_period_end', subscription.cancel_at_period_end,
      'new_period_end', new_end
    ));
end;
$$;

revoke all on function public.manage_manual_subscription(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.manage_manual_subscription(uuid, text, uuid, text) to service_role;

create or replace function public.undo_manual_subscription_extension(
  p_subscription_id uuid,
  p_admin_user_id uuid,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription public.subscriptions%rowtype;
  latest_audit public.billing_admin_audit_log%rowtype;
  previous_status text;
  previous_period_end timestamptz;
  previous_canceled_at timestamptz;
  previous_cancel_at_period_end boolean;
  expected_period_end timestamptz;
begin
  select * into subscription from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'subscription not found'; end if;
  if subscription.stripe_subscription_id is not null or subscription.payment_source <> 'manual' then
    raise exception 'Stripe subscriptions must be managed in Stripe';
  end if;

  select * into latest_audit
  from public.billing_admin_audit_log
  where subscription_id = p_subscription_id
  order by created_at desc, id desc
  limit 1;

  if not found or latest_audit.action <> 'manual_subscription_extend' then
    raise exception 'only the latest subscription extension can be undone';
  end if;
  if latest_audit.details is null
    or not (latest_audit.details ? 'previous_status')
    or not (latest_audit.details ? 'previous_period_end')
    or not (latest_audit.details ? 'previous_canceled_at')
    or not (latest_audit.details ? 'previous_cancel_at_period_end')
    or not (latest_audit.details ? 'new_period_end') then
    raise exception 'this extension does not contain a rollback snapshot';
  end if;

  previous_status := latest_audit.details ->> 'previous_status';
  previous_period_end := (latest_audit.details ->> 'previous_period_end')::timestamptz;
  previous_canceled_at := (latest_audit.details ->> 'previous_canceled_at')::timestamptz;
  previous_cancel_at_period_end := (latest_audit.details ->> 'previous_cancel_at_period_end')::boolean;
  expected_period_end := (latest_audit.details ->> 'new_period_end')::timestamptz;

  if previous_status not in ('active', 'trialing', 'past_due', 'cancelled')
    or previous_cancel_at_period_end is null
    or expected_period_end is null then
    raise exception 'invalid rollback snapshot';
  end if;
  if subscription.current_period_end is distinct from expected_period_end
    or subscription.status <> 'active'
    or subscription.canceled_at is not null
    or subscription.cancel_at_period_end then
    raise exception 'subscription changed after this extension and cannot be undone';
  end if;

  update public.subscriptions
  set status = previous_status,
    current_period_end = previous_period_end,
    canceled_at = previous_canceled_at,
    cancel_at_period_end = previous_cancel_at_period_end
  where id = p_subscription_id;

  insert into public.billing_admin_audit_log (admin_user_id, target_user_id, subscription_id, action, note, details)
  values (p_admin_user_id, subscription.user_id, subscription.id, 'manual_subscription_undo_extend',
    nullif(trim(p_note), ''), jsonb_build_object(
      'reverted_audit_id', latest_audit.id,
      'previous_period_end', subscription.current_period_end,
      'restored_period_end', previous_period_end,
      'restored_status', previous_status,
      'restored_canceled_at', previous_canceled_at,
      'restored_cancel_at_period_end', previous_cancel_at_period_end
    ));
end;
$$;

revoke all on function public.undo_manual_subscription_extension(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.undo_manual_subscription_extension(uuid, uuid, text) to service_role;
