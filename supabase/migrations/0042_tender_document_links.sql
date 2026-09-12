-- Known official download links for a tender's bid documents, discovered by
-- the ingestion pipeline — deliberately NOT `tender_documents`.
--
-- `tender_documents` means "this platform holds/has processed this file": a
-- row there is what /admin/documents-needed uses to decide a tender is DONE
-- (fetchTendersNeedingDocumentsFromDb filters on `tender_documents.length
-- === 0`). Writing discovered links into that table would have silently
-- emptied the whole worklist for every Peru tender the moment the links were
-- captured, while nothing had actually been downloaded or analyzed.
--
-- So a link lives here, and only becomes a `tender_documents` row once the
-- file itself has been fetched and recorded. The two tables answer different
-- questions: "where can this be downloaded from" vs. "what do we have".
--
-- Populated today by Peru's SEACE/OECE OCDS feed, whose records carry real
-- per-document URLs inline (`compiledRelease.tender.documents[].url` ->
-- prod1.seace.gob.pe/SeaceWeb-PRO/SdescargarArchivoAlfresco?fileCode=...).
-- Nothing about the table is Peru-specific; Colombia's SECOP II links can
-- move here whenever its proceso-id matching is confirmed.
create table if not exists tender_document_links (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders (id) on delete cascade,
  -- The government's own download URL. Unique per tender so re-ingesting the
  -- same month is an upsert, not a duplicate pile.
  source_url text not null,
  file_name text not null,
  -- OCDS documentType verbatim (biddingDocuments / clarifications / ...), so
  -- a later filtering-rule change can be applied without re-fetching.
  document_type text,
  format text,
  published_at timestamptz,
  discovered_at timestamptz not null default now(),
  unique (tender_id, source_url)
);

create index if not exists tender_document_links_tender_id_idx
  on tender_document_links (tender_id);

-- Same posture as 0023_server_only_tender_reads.sql: RLS on with no policy at
-- all, so only the service-role key reaches this. These are admin-side
-- ingestion breadcrumbs; the public site never offers document downloads.
alter table tender_document_links enable row level security;
