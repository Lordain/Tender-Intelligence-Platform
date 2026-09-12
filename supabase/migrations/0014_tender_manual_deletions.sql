-- Per the user's explicit follow-up request (2026-09-04): a tender an
-- admin deletes from the admin list (DELETE /api/admin/tenders/[slug])
-- should stay gone even if the same procedure shows up again in a later
-- re-ingest from its original source (same slug scheme — see
-- lib/ingestion/README.md — means a plain re-ingest would otherwise
-- silently re-insert it as a fresh row, undoing the admin's decision).
-- This is a tombstone table, not a soft-delete column on `tenders` itself,
-- because the row is genuinely gone (hard DELETE, matching the existing
-- admin delete button's behavior and its ON DELETE CASCADE child cleanup)
-- — there's nothing left on a `tenders` row to flag.
--
-- lib/ingestion/upsert-tenders.ts checks this table before writing a batch
-- and skips any tender whose slug is tombstoned here entirely (never
-- inserted, not even with a different classification) — same "skip
-- silently, log a count" posture as the "excluded" relevance tier.
--
-- No admin UI to browse/undo this yet — an admin who wants a tombstoned
-- tender back needs to delete its row from this table directly (Supabase
-- SQL Editor), same manual-SQL posture this project already uses for
-- applying migrations themselves.
create table if not exists tender_manual_deletions (
  slug text primary key,
  tender_number text,
  title text,
  deleted_at timestamptz not null default now()
);

alter table tender_manual_deletions enable row level security;

create policy "tender_manual_deletions no public access" on tender_manual_deletions
  for all using (false);
