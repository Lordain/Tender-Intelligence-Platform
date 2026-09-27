-- How to obtain a tender's full bid documents, where the source publishes only
-- a notice and the documents are requested, bought or collected from the
-- procuring entity (user, 2026-09-27: 如果标书需要特别获取，那针对这部分项目，
-- 要在项目详情页里面说明怎么获取标书).
--
-- Guyana first: eprocure.gov.gy carries each notice, and every notice words
-- the route differently — download from the entity's site, a free copy by
-- email, a G$3,000–10,000 set bought at the cashier, courier on a local
-- freight-collect account. The import reads it from the notice
-- (lib/ingestion/guyana-document-access.ts); the detail page shows it under
-- 官方正式投标入口.
--
-- Nullable, no default: NULL for every existing row and for every source whose
-- route is the same for all its tenders (those live in
-- lib/tender-search-guide.ts). Only the Guyana import writes it.
alter table public.tenders
  add column if not exists bid_document_access jsonb;

comment on column public.tenders.bid_document_access is
  'How to obtain the full bid documents, as the notice states it (download / email / fee / collect / courier). Written by the Guyana import only; NULL elsewhere. See types/tender.ts BidDocumentAccess.';
