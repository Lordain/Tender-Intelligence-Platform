-- Subscription period metadata used by the account page and cancellation.
-- Cancelling means "do not renew": access remains active through the paid
-- current_period_end, then the existing entitlement check downgrades to free.
alter table public.subscriptions
  add column if not exists current_period_start timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz;

update public.subscriptions
set current_period_start = created_at
where current_period_start is null;

alter table public.subscriptions
  alter column current_period_start set default now();
