-- Adds 'qwen3.7-plus' and 'claude-haiku-5-5' to extraction_model's allowed
-- values (2026-10-09, after the switch from qwen3.5/3.6-plus and Haiku 4.5).
--
-- The code switched models without this, so every analysis was refused at
-- write time by the 0028 check constraint. The old names stay allowed: rows
-- already analysed keep them.
alter table tender_documents drop constraint if exists tender_documents_extraction_model_check;

alter table tender_documents
  add constraint tender_documents_extraction_model_check
  check (extraction_model in (
    'claude-sonnet-5', 'claude-opus-5',
    'claude-haiku-4-5-20251001', 'claude-haiku-5-5',
    'qwen3.5-plus', 'qwen3.6-plus', 'qwen3.7-plus'
  ));
