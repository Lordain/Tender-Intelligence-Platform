-- Tender Intelligence Platform — initial schema
--
-- Localized text (Spanish/English/Chinese) is stored as jsonb, e.g.
--   {"es": "...", "en": "...", "zh": "..."}
-- matching the app's LocalizedText type. This keeps a single row as the
-- source of truth for a tender/requirement/risk instead of splitting each
-- field across a separate translations table + joins.
--
-- Run against a Supabase Postgres database (or any Postgres 14+ with the
-- pgcrypto extension available for gen_random_uuid()).

create extension if not exists pgcrypto;

-- Reference catalog of buyers (government agencies / public companies).
-- Not yet foreign-keyed from tenders — tenders.buyer stores the display
-- name directly — this exists so buyer-level analytics/filters can be
-- built later without a schema change.
create table if not exists buyers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  country text not null,
  government_level text not null
    check (government_level in ('federal', 'state', 'municipal', 'public_company', 'private')),
  created_at timestamptz not null default now()
);

-- Reference catalog of the platform's own industry classification
-- (independent of whatever category label the source portal used).
create table if not exists industries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name jsonb not null
);

create table if not exists tenders (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  tender_number text not null,
  title jsonb not null,
  summary jsonb not null,
  buyer text not null,
  country text not null,
  government_level text not null
    check (government_level in ('federal', 'state', 'municipal', 'public_company', 'private')),
  industry text not null,
  subcategory text,
  scope_type text not null
    check (scope_type in ('equipment', 'services', 'equipment_services', 'works', 'consulting')),
  procedure_type text not null,
  publication_date date not null,
  submission_deadline date,
  award_date date,
  estimated_value numeric,
  currency text,
  location text,
  status text not null
    check (status in ('planned', 'open', 'clarification', 'submission_closed', 'awarded', 'cancelled')),
  source_name text not null,
  source_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenders_status_idx on tenders (status);
create index if not exists tenders_industry_idx on tenders (industry);
create index if not exists tenders_publication_date_idx on tenders (publication_date desc);

-- Qualification, experience, and required-document requirements all share
-- the same shape (title, description, mandatory flag, source reference),
-- so they live in one table distinguished by `kind`.
create table if not exists tender_requirements (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders (id) on delete cascade,
  kind text not null check (kind in ('qualification', 'experience', 'document')),
  title jsonb not null,
  description jsonb not null,
  mandatory boolean not null default true,
  source_reference text,
  sort_order int not null default 0
);

create index if not exists tender_requirements_tender_id_idx on tender_requirements (tender_id);

create table if not exists tender_key_dates (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders (id) on delete cascade,
  type text not null check (
    type in (
      'publication', 'site_visit', 'questions_deadline', 'clarification',
      'submission', 'opening', 'award', 'contract_signing'
    )
  ),
  date date not null,
  mandatory boolean,
  notes jsonb
);

create index if not exists tender_key_dates_tender_id_idx on tender_key_dates (tender_id);

create table if not exists tender_risks (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders (id) on delete cascade,
  level text not null check (level in ('low', 'medium', 'high', 'critical')),
  title jsonb not null,
  description jsonb not null,
  source_reference text
);

create index if not exists tender_risks_tender_id_idx on tender_risks (tender_id);

-- Raw source attachments (Convocatoria, Anexo Técnico, Junta de
-- Aclaraciones, etc.) discovered by the ingestion pipeline. Not yet
-- populated by the app — schema placeholder for Phase 5 (Data Ingestion).
create table if not exists tender_documents (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders (id) on delete cascade,
  file_name text not null,
  document_type text,
  storage_url text,
  version int not null default 1,
  uploaded_at timestamptz not null default now()
);

create index if not exists tender_documents_tender_id_idx on tender_documents (tender_id);

-- App-specific user profile, one row per Supabase Auth user.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_name text,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('basic', 'professional', 'enterprise')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'cancelled')) default 'active',
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on subscriptions (user_id);

-- Row Level Security
-- Tender data is public product content: anyone (including anon) can read
-- it. Writes are performed by the ingestion pipeline using the service
-- role key, which bypasses RLS entirely, so no write policy is defined.
alter table buyers enable row level security;
alter table industries enable row level security;
alter table tenders enable row level security;
alter table tender_requirements enable row level security;
alter table tender_key_dates enable row level security;
alter table tender_risks enable row level security;
alter table tender_documents enable row level security;

create policy "Public read access" on buyers for select using (true);
create policy "Public read access" on industries for select using (true);
create policy "Public read access" on tenders for select using (true);
create policy "Public read access" on tender_requirements for select using (true);
create policy "Public read access" on tender_key_dates for select using (true);
create policy "Public read access" on tender_risks for select using (true);
create policy "Public read access" on tender_documents for select using (true);

-- Profile and subscription data is private to the owning user.
alter table profiles enable row level security;
alter table subscriptions enable row level security;

create policy "Users can view their own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update their own profile" on profiles
  for update using (auth.uid() = id);

create policy "Users can view their own subscription" on subscriptions
  for select using (auth.uid() = user_id);
