-- Billing period, and the Stripe identifiers a checkout flow will need.
--
-- Until now a subscription row said what someone had bought but not on what
-- cycle: the pricing page offers monthly, half-yearly and yearly, and there
-- was nowhere to record which one, so current_period_end could only ever be
-- filled in by hand.
alter table public.subscriptions
  add column if not exists billing_interval text not null default 'monthly',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

alter table public.subscriptions drop constraint if exists subscriptions_billing_interval_check;
alter table public.subscriptions add constraint subscriptions_billing_interval_check
  check (billing_interval in ('monthly', 'semiannual', 'annual'));

-- One Stripe subscription maps to exactly one row, so a webhook that is
-- delivered twice (Stripe retries) cannot create a duplicate.
create unique index if not exists subscriptions_stripe_subscription_idx
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- One live subscription per account. getViewerEntitlement() picks the first
-- row that still covers today out of an unordered list, and the cancellation
-- endpoint picks the newest — with two live rows those can disagree about
-- which subscription the person is on, and cancelling would silently leave
-- the other one running. An upgrade must close the old row (status
-- 'cancelled') before opening the new one.
--
-- If this index fails to create, some account already has two live rows;
-- resolve those first rather than dropping the constraint.
create unique index if not exists subscriptions_one_live_per_user_idx
  on public.subscriptions (user_id)
  where status in ('active', 'trialing');
