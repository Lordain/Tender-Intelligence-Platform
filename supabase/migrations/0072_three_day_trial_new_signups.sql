-- New accounts get a three-day trial (user, 2026-11-23: 我想调整成3天).
--
-- Only the column default changes, so only profiles created from here on are
-- affected. Unlike 0038, no existing row is touched (user: 只对新注册用户生效):
-- someone already in a longer trial keeps the end date they signed up with,
-- rather than being cut off the moment this runs.
--
-- lib/access-control.ts TRIAL_DAYS states the same three days on the pages.
alter table public.profiles
  alter column trial_ends_at set default (now() + interval '3 days');
