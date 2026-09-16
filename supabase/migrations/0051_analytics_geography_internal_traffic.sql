-- Add coarse geography and first-party internal-traffic classification to the
-- privacy-conscious product analytics introduced in migration 0016.
-- No raw IP address is stored: the hosting platform resolves country/region
-- before the request reaches the application.

alter table public.analytics_events
  add column if not exists country_code text,
  add column if not exists region_code text,
  add column if not exists is_internal boolean not null default false;

alter table public.analytics_events
  drop constraint if exists analytics_events_country_code_check,
  add constraint analytics_events_country_code_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  drop constraint if exists analytics_events_region_code_check,
  add constraint analytics_events_region_code_check
    check (region_code is null or region_code ~ '^[A-Z0-9-]{1,8}$');

create index if not exists analytics_events_internal_created_idx
  on public.analytics_events (is_internal, created_at desc);

drop view if exists public.analytics_daily_events;
create view public.analytics_daily_events
with (security_invoker = true)
as
select
  (created_at at time zone 'America/Mexico_City')::date as day,
  event_type,
  is_internal,
  count(*)::bigint as event_count,
  count(distinct coalesce(user_id::text, session_id::text))::bigint as visitor_count
from public.analytics_events
group by grouping sets ((1, 2, 3), (1, 2));

drop view if exists public.analytics_daily_filters;
create view public.analytics_daily_filters
with (security_invoker = true)
as
select
  (event.created_at at time zone 'America/Mexico_City')::date as day,
  event.properties ->> 'dimension' as dimension,
  value,
  event.is_internal,
  count(*)::bigint as use_count
from public.analytics_events event
cross join lateral jsonb_array_elements_text(
  case
    when jsonb_typeof(event.properties -> 'values') = 'array' then event.properties -> 'values'
    else '[]'::jsonb
  end
) as value
where event.event_type = 'filter_apply'
group by grouping sets ((1, 2, 3, 4), (1, 2, 3));

drop view if exists public.analytics_daily_tender_opens;
create view public.analytics_daily_tender_opens
with (security_invoker = true)
as
select
  (event.created_at at time zone 'America/Mexico_City')::date as day,
  event.tender_id,
  coalesce(tender.title ->> 'zh', tender.title ->> 'es', tender.public_slug) as tender_title,
  tender.public_slug as slug,
  event.is_internal,
  count(*)::bigint as open_count,
  count(distinct coalesce(event.user_id::text, event.session_id::text))::bigint as visitor_count
from public.analytics_events event
join public.tenders tender on tender.id = event.tender_id
where event.event_type = 'tender_open'
group by grouping sets ((1, 2, 3, 4, 5), (1, 2, 3, 4));

drop view if exists public.analytics_current_favorites;
create view public.analytics_current_favorites
with (security_invoker = true)
as
select
  latest.tender_id,
  coalesce(tender.title ->> 'zh', tender.title ->> 'es', tender.public_slug) as tender_title,
  tender.public_slug as slug,
  latest.is_internal,
  count(*)::bigint as favorite_count
from (
  select distinct on (coalesce(user_id::text, session_id::text), tender_id)
    coalesce(user_id::text, session_id::text) as actor_id,
    tender_id,
    event_type,
    is_internal
  from public.analytics_events
  where event_type in ('tender_save', 'tender_unsave')
    and tender_id is not null
  order by coalesce(user_id::text, session_id::text), tender_id, created_at desc, id desc
) latest
join public.tenders tender on tender.id = latest.tender_id
where latest.event_type = 'tender_save'
group by latest.tender_id, tender.title, tender.public_slug, latest.is_internal;

create or replace view public.analytics_daily_geography
with (security_invoker = true)
as
select
  (created_at at time zone 'America/Mexico_City')::date as day,
  coalesce(country_code, 'UNKNOWN') as country_code,
  coalesce(region_code, 'UNKNOWN') as region_code,
  is_internal,
  count(*)::bigint as page_views,
  count(distinct coalesce(user_id::text, session_id::text))::bigint as visitor_count
from public.analytics_events
where event_type = 'page_view'
group by grouping sets ((1, 2, 3, 4), (1, 2, 3));

create or replace function public.analytics_period_summary_v2(period_start timestamptz)
returns table (
  page_views bigint,
  visitors bigint,
  external_page_views bigint,
  external_visitors bigint,
  internal_page_views bigint,
  internal_visitors bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint,
    count(distinct coalesce(user_id::text, session_id::text))::bigint,
    count(*) filter (where not is_internal)::bigint,
    count(distinct coalesce(user_id::text, session_id::text)) filter (where not is_internal)::bigint,
    count(*) filter (where is_internal)::bigint,
    count(distinct coalesce(user_id::text, session_id::text)) filter (where is_internal)::bigint
  from public.analytics_events
  where event_type = 'page_view'
    and created_at >= period_start;
$$;

create or replace function public.analytics_geography_summary(
  period_start timestamptz,
  traffic_scope text default 'external'
)
returns table (
  country_code text,
  region_code text,
  page_views bigint,
  visitors bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(event.country_code, 'UNKNOWN'),
    coalesce(event.region_code, 'UNKNOWN'),
    count(*)::bigint,
    count(distinct coalesce(event.user_id::text, event.session_id::text))::bigint
  from public.analytics_events event
  where event.event_type = 'page_view'
    and event.created_at >= period_start
    and case traffic_scope
      when 'internal' then event.is_internal
      when 'all' then true
      else not event.is_internal
    end
  group by 1, 2
  order by visitors desc, page_views desc;
$$;

revoke all on public.analytics_daily_events from anon, authenticated;
revoke all on public.analytics_daily_filters from anon, authenticated;
revoke all on public.analytics_daily_tender_opens from anon, authenticated;
revoke all on public.analytics_current_favorites from anon, authenticated;
revoke all on public.analytics_daily_geography from anon, authenticated;
revoke execute on function public.analytics_period_summary_v2(timestamptz) from public, anon, authenticated;
revoke execute on function public.analytics_geography_summary(timestamptz, text) from public, anon, authenticated;

grant select on public.analytics_daily_events to service_role;
grant select on public.analytics_daily_filters to service_role;
grant select on public.analytics_daily_tender_opens to service_role;
grant select on public.analytics_current_favorites to service_role;
grant select on public.analytics_daily_geography to service_role;
grant execute on function public.analytics_period_summary_v2(timestamptz) to service_role;
grant execute on function public.analytics_geography_summary(timestamptz, text) to service_role;
