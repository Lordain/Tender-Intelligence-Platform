-- Homepage "featured for free preview" selection (2026-09-04): once the
-- paywall (subscription tiers) is turned on, unsubscribed visitors will
-- only see a handful of tenders on the homepage for free. Which tenders
-- those are is now an explicit admin choice (this column), and how many
-- show is a separate, adjustable setting (site_settings row below) rather
-- than a hardcoded constant in the homepage component.
alter table tenders add column if not exists homepage_featured boolean not null default false;

-- Small general-purpose key/value settings table — starts with just the
-- homepage featured count, but shaped to hold future site-wide toggles
-- (e.g. paywall on/off) without a new table per setting.
create table if not exists site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table site_settings enable row level security;

-- Deny-all for anon/authenticated — only the service-role admin client
-- (which bypasses RLS entirely) ever reads or writes this, same pattern as
-- tender_manual_deletions (0014_tender_manual_deletions.sql).
create policy "site_settings_no_public_access" on site_settings for all using (false);

insert into site_settings (key, value)
values ('homepage_featured_count', '3'::jsonb)
on conflict (key) do nothing;
