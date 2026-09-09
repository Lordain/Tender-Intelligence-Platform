create table if not exists public.stripe_webhook_failures (
  event_id text primary key,
  event_type text not null,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  failure_count integer not null default 1 check (failure_count > 0),
  last_error text not null,
  alerted_at timestamptz,
  resolved_at timestamptz,
  recovery_notified_at timestamptz
);

alter table public.stripe_webhook_failures enable row level security;
revoke all on table public.stripe_webhook_failures from public, anon, authenticated;
grant all on table public.stripe_webhook_failures to service_role;

create or replace function public.record_stripe_webhook_failure(
  p_event_id text,
  p_event_type text,
  p_error text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  failure public.stripe_webhook_failures%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_event_id, 0));
  select * into failure from public.stripe_webhook_failures where event_id = p_event_id for update;

  if not found then
    insert into public.stripe_webhook_failures (event_id, event_type, last_error)
    values (p_event_id, p_event_type, left(p_error, 2000));
    return true;
  end if;

  if failure.resolved_at is not null then
    update public.stripe_webhook_failures
    set event_type = p_event_type,
      first_failed_at = now(),
      last_failed_at = now(),
      failure_count = 1,
      last_error = left(p_error, 2000),
      alerted_at = null,
      resolved_at = null,
      recovery_notified_at = null
    where event_id = p_event_id;
    return true;
  end if;

  update public.stripe_webhook_failures
  set last_failed_at = now(), failure_count = failure_count + 1, last_error = left(p_error, 2000)
  where event_id = p_event_id;
  return failure.alerted_at is null;
end;
$$;

create or replace function public.resolve_stripe_webhook_failure(p_event_id text) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  failure public.stripe_webhook_failures%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_event_id, 0));
  select * into failure from public.stripe_webhook_failures where event_id = p_event_id for update;
  if not found or failure.recovery_notified_at is not null then return false; end if;
  if failure.resolved_at is null then
    update public.stripe_webhook_failures set resolved_at = now() where event_id = p_event_id;
  end if;
  return true;
end;
$$;

create or replace function public.mark_stripe_webhook_notification(
  p_event_id text,
  p_notification text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_notification = 'failure' then
    update public.stripe_webhook_failures set alerted_at = coalesce(alerted_at, now()) where event_id = p_event_id;
  elsif p_notification = 'recovery' then
    update public.stripe_webhook_failures set recovery_notified_at = coalesce(recovery_notified_at, now()) where event_id = p_event_id;
  else
    raise exception 'invalid notification type';
  end if;
end;
$$;

revoke all on function public.record_stripe_webhook_failure(text, text, text) from public, anon, authenticated;
revoke all on function public.resolve_stripe_webhook_failure(text) from public, anon, authenticated;
revoke all on function public.mark_stripe_webhook_notification(text, text) from public, anon, authenticated;
grant execute on function public.record_stripe_webhook_failure(text, text, text) to service_role;
grant execute on function public.resolve_stripe_webhook_failure(text) to service_role;
grant execute on function public.mark_stripe_webhook_notification(text, text) to service_role;
