-- Widens extraction_model's check constraint (0009) for the new
-- --provider=auto routing wired into extract-tender-document.ts
-- (2026-09-03): by default a document now gets routed to whichever
-- model actually produced its extraction, not always a Claude tier —
-- 'qwen3.5-plus' for a document with a real text layer (cheaper,
-- confirmed working well this session), 'claude-haiku-4-5-20251001' for
-- a scanned/image-only PDF (the only provider confirmed to read scanned
-- pages correctly, including after the new PDF-chunking path). The
-- existing two values stay for --precise (claude-opus-5, the paid "精度
-- 分析" tier) and any already-stored claude-sonnet-5 rows from before
-- auto-routing existed.
alter table tender_documents drop constraint if exists tender_documents_extraction_model_check;

alter table tender_documents
  add constraint tender_documents_extraction_model_check
  check (extraction_model in ('claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001', 'qwen3.5-plus'));
