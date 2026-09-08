-- Protects hand-entered key dates from being wiped by a re-ingest.
--
-- Companion to migration 0030, same 2026-09-08 report. That one covers the
-- `tenders` row's own columns; this covers the child table. The importer
-- (lib/ingestion/upsert-tenders.ts) refreshes a tender's key dates by
-- DELETING every tender_key_dates row for it and re-inserting only what the
-- source supplied — so a 现场踏勘 / 提问截止 / 澄清会议 an admin typed into
-- the key-dates editor (which no source provides) disappeared on the next
-- import of that tender, silently and with nothing left to recover from.
--
-- Rows written by app/api/admin/tenders/[slug]/key-dates (the "其他关键日期"
-- editor) set this true; the importer now deletes only rows where it is
-- false. Rows mirrored from the tender's own columns by
-- lib/db/key-dates-sync.ts stay false — they are derived data, and their
-- source columns are protected by 0030 instead.
alter table tender_key_dates
  add column if not exists manually_added boolean not null default false;

comment on column tender_key_dates.manually_added is
  'True for key dates an admin typed in via /admin/tenders/[slug]. lib/ingestion/upsert-tenders.ts never deletes these, so a re-ingest cannot wipe them.';
