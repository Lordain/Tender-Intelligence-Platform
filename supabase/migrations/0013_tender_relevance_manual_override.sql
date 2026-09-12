-- Per the user's explicit request (2026-09-04): once an admin manually
-- sets a tender's relevance_tier (e.g. to "excluded", via the edit form),
-- a later re-ingest of that same tender from its original source should
-- no longer silently overwrite that choice with a freshly computed
-- classifyRelevance() result. This flag records that a human made the
-- call — lib/ingestion/upsert-tenders.ts checks it before writing
-- relevance_tier/relevance_label/relevance_reason on an upsert; an admin
-- can clear it again from the same edit form to resume automatic
-- classification.
alter table tenders add column if not exists relevance_manually_overridden boolean not null default false;
