-- Lets an admin dismiss a tender from the /admin/documents-needed worklist
-- without ever uploading a document — for sources with no automated
-- attachment path at all (Colombia's SECOP II detail page is CAPTCHA-
-- gated; see lib/ingestion/README.md), a tender would otherwise sit in
-- that worklist forever with no way to mark "not obtainable" distinct from
-- "not yet attempted". Never touches relevance_tier — this only affects
-- which tenders the worklist query surfaces.

alter table tenders
  add column if not exists documents_unavailable boolean not null default false;
