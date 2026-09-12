-- Replaces the single `industry text` column with `industries text[]`.
-- Most real connectors (PEMEX, DOF, DOF-search, CompraNet5, Compras MX
-- open tenders) never had a real industry classification to begin with —
-- they hardcoded industry = "General". A tender can also genuinely belong
-- to more than one category (a railway project is both "transportation"
-- and "construction"), which a single-value column can't represent at
-- all. See lib/industry.ts for the new rule-based multi-tag classifier
-- every connector now runs uniformly.

alter table tenders add column if not exists industries text[] not null default '{}';

-- Backfill: wrap whatever the old single value was into a one-element
-- array, so no row silently loses its only industry signal. Real
-- ingestion runs after this migration compute real multi-tag values via
-- classifyIndustries() and overwrite this on next upsert; this backfill
-- is just "don't regress existing rows to empty" in the meantime.
update tenders set industries = array[industry]
  where industries = '{}' and industry is not null and industry <> '';

drop index if exists tenders_industry_idx;
alter table tenders drop column if exists industry;

create index if not exists tenders_industries_idx on tenders using gin (industries);
