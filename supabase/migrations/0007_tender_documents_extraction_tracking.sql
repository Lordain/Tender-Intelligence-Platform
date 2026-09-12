-- Groundwork for Phase 6 (Layer 2 extraction — see lib/ingestion/README.md
-- "What's deliberately NOT built yet"). tender_documents existed since
-- 0001 as an unpopulated placeholder; these columns are what an extraction
-- pipeline will actually need once real document access is verified:
--   - source_url: the real government URL the document came from
--     (provenance/audit), distinct from storage_url (this platform's own
--     copy, e.g. in Supabase Storage, once it has one).
--   - content_hash: sha256 of the raw file — lets re-ingestion detect
--     "this exact document was already extracted, skip the LLM call"
--     (the same "analyze once, all subscribers reuse" cost-control
--     principle already used for tender relevance) and "the source
--     changed since last time, re-extract."
--   - extraction_status / extracted_at: whether Layer 2 has processed
--     this document yet, so the ingestion pipeline can find unprocessed
--     documents without re-scanning everything.
-- No table for extraction results — those already exist
-- (tender_requirements, tender_risks) and don't need a new home, just a
-- populated pipeline.

alter table tender_documents
  add column if not exists source_url text,
  add column if not exists content_hash text,
  add column if not exists extraction_status text
    check (extraction_status in ('pending', 'extracted', 'failed', 'not_extractable'))
    default 'pending',
  add column if not exists extracted_at timestamptz;

create index if not exists tender_documents_extraction_status_idx
  on tender_documents (extraction_status);
