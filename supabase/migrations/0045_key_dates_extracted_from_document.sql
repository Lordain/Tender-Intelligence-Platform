-- Marks a key date that was read out of the tender's own bid document by the
-- Layer 2 extraction, rather than supplied by the source feed.
--
-- Peru's OECE records carry no submission deadline at all — every date the
-- SEACE cronograma shows lives only inside the bases PDF, which this platform
-- already downloads (user, 2026-09-12: 优先从标书抓日期). Once the extraction
-- writes those dates, the importer must not wipe them: upsert-tenders.ts
-- refreshes a tender's key dates by deleting every row the source did not
-- supply, and the source supplies none of these — so the very next Peru
-- re-import would delete exactly the dates that took a model call to obtain.
--
-- Deliberately a separate flag from `manually_added` (migration 0033) rather
-- than reusing it. Both mean "the importer must not delete this", but they do
-- not mean the same thing to a reader: one is a person's own entry, the other
-- is a machine reading a PDF, and only the second is worth re-running when a
-- better model exists or the document is superseded by an addendum. Collapsing
-- them would make those two populations indistinguishable forever.
alter table tender_key_dates
  add column if not exists extracted_from_document boolean not null default false;

comment on column tender_key_dates.extracted_from_document is
  'True for key dates extracted from the tender bid document by lib/ingestion/extract-requirements.ts. Like manually_added, the importer never deletes these — but these came from a model reading a PDF, not from a human.';
