-- Store the contract duration a connector reads from a STRUCTURED source
-- field, so the relevance classifier sees the same value at import and at
-- reclassify.
--
-- Why: colombia-mapper.ts computes this from SECOP II's
-- `duracion`/`unidad_de_duracion` and feeds it to classifyRelevance(), where
-- a duration >= 360 days is one of the conditions that promotes a tender to
-- the flagship tier (and < 180 days excludes it outright). It had nowhere to
-- live on this table, so `npm run reclassify:tenders` — which can only read
-- back stored columns — recomputed those same Colombian rows with the signal
-- missing and quietly demoted them. That is the same class of bug as the
-- mappers omitting `country`: two paths, two answers for one row.
--
-- Nullable with no backfill on purpose. The value was never stored, so there
-- is nothing to recover for existing rows; NULL means "unknown", which is
-- exactly how the classifier already treats an absent duration, so no
-- existing row changes tier because of this migration. Rows re-imported from
-- Colombia after this ships fill it in.
alter table public.tenders
  add column if not exists structured_duration_days integer;

comment on column public.tenders.structured_duration_days is
  'Contract duration in days from a structured source field (currently only Colombia SECOP II duracion/unidad_de_duracion). Feeds lib/relevance.ts SHORT_DURATION_DAYS/LONG_DURATION_DAYS. NULL = the source did not state one.';
