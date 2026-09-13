-- Extend the no-card trial from three days to five days.
--
-- The mirror of 0038, which shortened seven to three. The default governs
-- every profile created from here on.
--
-- The update covers profiles that already exist, and lengthening needs it for
-- the same reason shortening did, inverted. 0038 capped existing rows so the
-- DB could not stay more generous than the copy; here the risk runs the other
-- way — with only the default changed, the site would advertise five days to
-- someone who signed up yesterday and still cut them off on day three.
--
-- Overwriting trial_ends_at is safe because nothing in the application writes
-- that column: the default sets it at signup and every other code path only
-- reads it (lib/access-control-server.ts). So there are no deliberately
-- shortened trials for this to clobber. The one writer is
-- scripts/seed-test-accounts.ts, which backdates the QA fixtures on purpose —
-- re-run it after this migration to restore them.
--
-- Rows already running past five days are left alone, so a trial someone
-- extended by hand keeps its end date.
alter table public.profiles
  alter column trial_ends_at set default (now() + interval '5 days');

update public.profiles
set trial_ends_at = created_at + interval '5 days'
where trial_ends_at < created_at + interval '5 days';
