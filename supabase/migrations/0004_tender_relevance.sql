-- Pre-Screening classification (see lib/relevance.ts). Computed once at
-- ingestion time and stored, not recomputed on every read — same "analyze
-- once, all subscribers reuse" principle as the platform's AI cost-control
-- design, even though this particular classifier is rule-based, not AI.

alter table tenders
  add column if not exists relevance_tier text
    check (relevance_tier in ('flagship', 'significant', 'standard', 'excluded')),
  add column if not exists relevance_label jsonb,
  add column if not exists relevance_reason jsonb;

create index if not exists tenders_relevance_tier_idx on tenders (relevance_tier);
