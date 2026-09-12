-- Actual awarded/contract amount — distinct from estimated_value (the
-- pre-tender budget estimate, which a real award can differ from). Only
-- meaningful once a tender is awarded; populated manually by an admin via
-- app/admin/tenders/[slug] (no ingestion source currently supplies this),
-- so it stays nullable like awarded_to (see 0006_tender_awarded_to.sql).

alter table tenders
  add column if not exists awarded_value numeric;
