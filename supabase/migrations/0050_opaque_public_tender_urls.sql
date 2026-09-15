-- Separate the stable public URL from the source-derived ingestion key.
--
-- `slug` is intentionally kept unchanged: importers, admin routes, tombstones
-- and document matching use it to identify the same government procedure on
-- every refresh. It often embeds the official procedure number, so it must no
-- longer appear in visitor-facing URLs.
--
-- 64 random bits keeps the public path compact while making it impractical to
-- infer or enumerate source identifiers. The unique index is the final guard
-- against the vanishingly unlikely collision.
alter table public.tenders
  add column if not exists public_slug text;

update public.tenders
set public_slug = 'p-' || left(replace(gen_random_uuid()::text, '-', ''), 16)
where public_slug is null or btrim(public_slug) = '';

alter table public.tenders
  alter column public_slug set default ('p-' || left(replace(gen_random_uuid()::text, '-', ''), 16)),
  alter column public_slug set not null;

create unique index if not exists tenders_public_slug_key
  on public.tenders (public_slug);

comment on column public.tenders.public_slug is
  'Opaque, immutable public URL token. Never derive it from slug, tender_number, source IDs, titles, buyers or other government identifiers.';

-- The analytics views previously returned the internal slug for admin links.
-- Keep their output column named `slug` for compatibility, but make its value
-- the safe public token so even an analytics-driven link cannot recreate the
-- old source-derived URL.
create or replace view public.analytics_daily_tender_opens
with (security_invoker = true)
as
select
  (event.created_at at time zone 'America/Mexico_City')::date as day,
  event.tender_id,
  coalesce(tender.title ->> 'zh', tender.title ->> 'es', tender.public_slug) as tender_title,
  tender.public_slug as slug,
  count(*)::bigint as open_count,
  count(distinct coalesce(event.user_id::text, event.session_id::text))::bigint as visitor_count
from public.analytics_events event
join public.tenders tender on tender.id = event.tender_id
where event.event_type = 'tender_open'
group by 1, 2, 3, 4;

create or replace view public.analytics_current_favorites
with (security_invoker = true)
as
select
  latest.tender_id,
  coalesce(tender.title ->> 'zh', tender.title ->> 'es', tender.public_slug) as tender_title,
  tender.public_slug as slug,
  count(*)::bigint as favorite_count
from (
  select distinct on (coalesce(user_id::text, session_id::text), tender_id)
    coalesce(user_id::text, session_id::text) as actor_id,
    tender_id,
    event_type
  from public.analytics_events
  where event_type in ('tender_save', 'tender_unsave')
    and tender_id is not null
  order by coalesce(user_id::text, session_id::text), tender_id, created_at desc, id desc
) latest
join public.tenders tender on tender.id = latest.tender_id
where latest.event_type = 'tender_save'
group by latest.tender_id, tender.title, tender.public_slug;
