-- Protects every field an admin edits by hand from being overwritten by a
-- later re-ingest of the same tender.
--
-- Real bug this fixes (2026-09-08, reported by the user): they corrected a
-- tender's 发布日期 from the placeholder ingestion date to the real
-- 2026-08-21 and unchecked "该日期是估算值". The next import of the same
-- source upserted the row and put both back — the date returned to the
-- ingestion timestamp and the 估 badge reappeared. The same applied to
-- every other hand-corrected field (title, summary, buyer, deadline...).
--
-- Until now only the relevance columns were protected, via the separate
-- boolean `relevance_manually_overridden` (2026-09-04). That flag stays as
-- it is: it is a deliberate, user-facing checkbox in the edit form, toggled
-- on purpose, and it guards a computed classification rather than typed-in
-- data. This column is the opposite — filled in automatically, by observing
-- what actually changed on save.
--
-- Holds Postgres COLUMN names (e.g. 'publication_date', 'title'), not the
-- camelCase form-field names, because lib/ingestion/upsert-tenders.ts uses
-- it to decide which keys to leave out of the upsert payload. Empty array,
-- never null, so that code can treat "no overrides" and "never edited" the
-- same way without a null check.
alter table tenders
  add column if not exists manual_field_overrides text[] not null default '{}';

comment on column tenders.manual_field_overrides is
  'Postgres column names an admin has hand-edited via /admin/tenders/[slug]. lib/ingestion/upsert-tenders.ts omits these keys when re-upserting the tender, so a re-ingest cannot overwrite manual corrections. Written by app/api/admin/tenders/[slug]/route.ts.';
