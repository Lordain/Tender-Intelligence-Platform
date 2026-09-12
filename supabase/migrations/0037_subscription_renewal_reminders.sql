-- Durable, idempotent delivery state for legally required automatic-renewal
-- reminders. One subscription period can be sent once; failed or abandoned
-- processing claims may be retried safely by the next daily cron run.

create table if not exists public.subscription_renewal_reminders (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  period_end timestamptz not null,
  status text not null check (status in ('processing', 'sent', 'failed')),
  resend_email_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (subscription_id, period_end)
);

create index if not exists subscription_renewal_reminders_status_idx
  on public.subscription_renewal_reminders (status, period_end);

alter table public.subscription_renewal_reminders enable row level security;
revoke all on table public.subscription_renewal_reminders from public, anon, authenticated;
grant all on table public.subscription_renewal_reminders to service_role;

create or replace function public.claim_subscription_renewal_reminder(
  p_subscription_id uuid,
  p_user_id uuid,
  p_period_end timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  insert into public.subscription_renewal_reminders (
    subscription_id, user_id, period_end, status
  ) values (
    p_subscription_id, p_user_id, p_period_end, 'processing'
  )
  on conflict (subscription_id, period_end) do update
  set status = 'processing',
      error_message = null,
      updated_at = now()
  where subscription_renewal_reminders.status = 'failed'
     or (
       subscription_renewal_reminders.status = 'processing'
       and subscription_renewal_reminders.updated_at < now() - interval '15 minutes'
     )
  returning id into claimed_id;

  return claimed_id;
end;
$$;

revoke all on function public.claim_subscription_renewal_reminder(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_subscription_renewal_reminder(uuid, uuid, timestamptz)
  to service_role;
