-- Marks whether tenders.publication_date is a real government-published
-- date or a stand-in (the ingestion timestamp) — see Tender.
-- publicationDateIsEstimated in types/tender.ts for the full reasoning.
-- Some real sources (Compras MX's "Difusión de procedimientos" open-
-- tenders export, and Proyectos Estratégicos MX which reuses that same
-- mapper) simply carry no publication-date column at all, confirmed
-- against real captured files; other sources (DOF, PEMEX, Compras MX
-- contracts, LicitIA's bulk vigente feed when its own "publicacion"
-- field is present, etc.) do carry a real one. Real, user-caught
-- confusion (2026-09-04) when a tender's shown date didn't match the
-- official Proyectos Estratégicos MX portal prompted this.
--
-- Defaults false (real date) so every already-ingested row is treated
-- as real until re-ingested with the mapper changes that now set this
-- explicitly — existing Compras MX open-tenders/Proyectos Estratégicos
-- MX rows won't get the honest "估算" label until their source file is
-- re-ingested with --write (a safe, idempotent upsert, same as any
-- other re-ingestion).
alter table tenders
  add column if not exists publication_date_is_estimated boolean not null default false;
