-- Reduce the no-card trial from seven days to three days.
--
-- The first statement controls every profile created after this migration.
-- The update also caps existing trials at three days from account creation,
-- so changing the website copy cannot leave day 4-7 access active in the DB.
alter table public.profiles
  alter column trial_ends_at set default (now() + interval '3 days');

update public.profiles
set trial_ends_at = created_at + interval '3 days'
where trial_ends_at > created_at + interval '3 days';
