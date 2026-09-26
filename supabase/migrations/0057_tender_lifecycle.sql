-- A tender's whole lifecycle, not just open → closed (user, 2026-09-26:
-- 不要只有暂停，也要考虑后续的恢复或者取消、重发).
--
-- 1. Two new status values.
--
--    suspended — the buyer paused the procedure (Peru OxI "Suspendido",
--      Mexico "SUSPENDIDO", Chile "Suspendida", Brazil "Suspensa"). Until now
--      each mapper had to pick an existing value, and they disagreed: Mexico
--      wrote cancelled, Chile and Brazil submission_closed, Peru OxI kept
--      open. None of those is true, and two of them are terminal — a paused
--      tender that resumes is exactly what a reader must not have written off.
--      Resuming is the source reporting it open again; the change is recorded
--      in tender_status_history (0018) like any other.
--
--    deserted — 流标: the procedure ended with no valid bid or no winner
--      ("Desierto"/"Desierta"/"Deserta", OCDS `unsuccessful`). Written as
--      cancelled until now, which says the buyer called it off. It did not;
--      nobody qualified, and a re-issue is the usual next step.
--
--    Existing rows are untouched: this only widens what the constraint
--    accepts, so nothing already stored becomes invalid.
--
-- 2. tender_reissues — 重发. When a procedure is re-issued under a NEW code
--    after being cancelled, deserted or suspended, the import links the new
--    row to the earlier one, so each page can point at the other. A separate
--    table rather than a column on tenders so that the ingestion upsert (which
--    rewrites the columns it lists on every import) can never clear a link.
--
-- The application checks for tender_reissues before writing either new status
-- (lib/ingestion/lifecycle-schema.ts), so code deployed before this file is
-- run keeps writing the old values instead of failing whole import batches.
-- Run the file as one unit.

begin;

alter table tenders drop constraint if exists tenders_status_check;

alter table tenders
  add constraint tenders_status_check
  check (status in (
    'planned', 'open', 'clarification', 'submission_closed', 'awarded', 'cancelled',
    'suspended', 'deserted'
  ));

create table if not exists tender_reissues (
  id bigint generated always as identity primary key,
  -- The new procedure.
  tender_id uuid not null references tenders (id) on delete cascade,
  -- The earlier one it re-issues.
  previous_tender_id uuid not null references tenders (id) on delete cascade,
  -- How the two were matched, for an admin reading the link later
  -- (e.g. "same CUI", "same buyer and title").
  matched_by text not null,
  created_at timestamptz not null default now(),
  unique (tender_id, previous_tender_id),
  check (tender_id <> previous_tender_id)
);

create index if not exists tender_reissues_previous_idx on tender_reissues (previous_tender_id);

alter table tender_reissues enable row level security;
revoke all on tender_reissues from anon, authenticated;
grant select, insert, delete on tender_reissues to service_role;
grant usage, select on sequence tender_reissues_id_seq to service_role;

commit;
