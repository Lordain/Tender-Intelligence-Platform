-- Tracks which model tier produced the currently-stored extraction
-- result (see lib/ingestion/extract-requirements.ts's ExtractionModel).
-- Per the user's explicit decision (2026-09-02): a premium "精度分析"
-- (Opus 5) re-run of an already-extracted document overwrites the
-- standard-tier ("标准分析", Sonnet 5) result outright — same row,
-- same tender_requirements/tender_risks rows replaced, not a second
-- parallel copy. This column is what lets the (not yet built) paid-
-- gating UI show "already precision-analyzed" and avoid a standard-tier
-- re-run silently downgrading a document a subscriber already paid to
-- have analyzed at the higher tier.
alter table tender_documents
  add column if not exists extraction_model text
    check (extraction_model in ('claude-sonnet-5', 'claude-opus-5'));
