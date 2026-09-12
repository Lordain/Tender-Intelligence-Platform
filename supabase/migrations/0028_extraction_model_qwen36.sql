-- Adds 'qwen3.6-plus' to extraction_model's allowed values.
--
-- Document analysis now picks the model from the tender's own scale tag:
-- a flagship (大型项目) document goes to qwen3.6-plus, significant and
-- standard stay on qwen3.5-plus, and a scanned document still goes to
-- claude-haiku regardless (only it reads image-only pages reliably).
-- Without this the first flagship analysis would fail the 0010 check
-- constraint at write time — after the model call had already been paid
-- for.
alter table tender_documents drop constraint if exists tender_documents_extraction_model_check;

alter table tender_documents
  add constraint tender_documents_extraction_model_check
  check (extraction_model in ('claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001', 'qwen3.5-plus', 'qwen3.6-plus'));
