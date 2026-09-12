-- Renames the "basic" subscription plan to "explorer" to match the
-- Explorer / Professional / Enterprise pricing tiers (lib/pricing.ts).
-- Safe to run even with no rows yet — no billing is wired up (see
-- app/pricing/page.tsx's "checkout isn't connected yet" note).

alter table subscriptions drop constraint if exists subscriptions_plan_check;

update subscriptions set plan = 'explorer' where plan = 'basic';

alter table subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('explorer', 'professional', 'enterprise'));
