-- Accounts the operations dashboard leaves out of 已注册用户 and 当前订阅用户
-- (2026-10-05: 现在的5个注册用户，和刚刚加的订阅用户，都不要算进来) — the
-- owner's own, test and complimentary accounts. Access is untouched: this
-- only decides what lib/db/analytics.ts counts. New sign-ups default to
-- counted.

alter table public.profiles
  add column if not exists exclude_from_stats boolean not null default false;
