-- Privacy-conscious first-party product analytics. Events are written only
-- through the validated /api/analytics/events route with the service role;
-- browsers never receive read access to raw analytics rows.

create table if not exists analytics_events (
  id bigint generated always as identity primary key,
  event_type text not null check (
    event_type in ('page_view', 'tender_open', 'filter_apply', 'tender_save', 'tender_unsave')
  ),
  session_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  path text,
  tender_id uuid references tenders (id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (char_length(coalesce(path, '')) <= 500),
  check (jsonb_typeof(properties) = 'object')
);

create index if not exists analytics_events_created_at_idx
  on analytics_events (created_at desc);
create index if not exists analytics_events_type_created_idx
  on analytics_events (event_type, created_at desc);
create index if not exists analytics_events_tender_created_idx
  on analytics_events (tender_id, created_at desc)
  where tender_id is not null;

alter table analytics_events enable row level security;

-- The dashboard reads compact daily aggregates instead of exposing raw rows.
create or replace view analytics_daily_events
with (security_invoker = true)
as
select
  (created_at at time zone 'America/Mexico_City')::date as day,
  event_type,
  count(*)::bigint as event_count,
  count(distinct coalesce(user_id::text, session_id::text))::bigint as visitor_count
from analytics_events
group by 1, 2;

create or replace view analytics_daily_filters
with (security_invoker = true)
as
select
  (event.created_at at time zone 'America/Mexico_City')::date as day,
  event.properties ->> 'dimension' as dimension,
  value,
  count(*)::bigint as use_count
from analytics_events event
cross join lateral jsonb_array_elements_text(
  case
    when jsonb_typeof(event.properties -> 'values') = 'array' then event.properties -> 'values'
    else '[]'::jsonb
  end
) as value
where event.event_type = 'filter_apply'
group by 1, 2, 3;

create or replace view analytics_daily_tender_opens
with (security_invoker = true)
as
select
  (event.created_at at time zone 'America/Mexico_City')::date as day,
  event.tender_id,
  coalesce(tender.title ->> 'zh', tender.title ->> 'es', tender.slug) as tender_title,
  tender.slug,
  count(*)::bigint as open_count,
  count(distinct coalesce(event.user_id::text, event.session_id::text))::bigint as visitor_count
from analytics_events event
join tenders tender on tender.id = event.tender_id
where event.event_type = 'tender_open'
group by 1, 2, 3, 4;

-- One current favorite per visitor/project, derived from that visitor's most
-- recent save or unsave action. This keeps anonymous local favorites useful
-- for aggregate operations without collecting names or search text.
create or replace view analytics_current_favorites
with (security_invoker = true)
as
select
  latest.tender_id,
  coalesce(tender.title ->> 'zh', tender.title ->> 'es', tender.slug) as tender_title,
  tender.slug,
  count(*)::bigint as favorite_count
from (
  select distinct on (coalesce(user_id::text, session_id::text), tender_id)
    coalesce(user_id::text, session_id::text) as actor_id,
    tender_id,
    event_type
  from analytics_events
  where event_type in ('tender_save', 'tender_unsave')
    and tender_id is not null
  order by coalesce(user_id::text, session_id::text), tender_id, created_at desc, id desc
) latest
join tenders tender on tender.id = latest.tender_id
where latest.event_type = 'tender_save'
group by latest.tender_id, tender.title, tender.slug;

create or replace function analytics_period_summary(period_start timestamptz)
returns table (page_views bigint, visitors bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint as page_views,
    count(distinct coalesce(user_id::text, session_id::text))::bigint as visitors
  from analytics_events
  where event_type = 'page_view'
    and created_at >= period_start;
$$;

revoke all on analytics_events from anon, authenticated;
revoke all on analytics_daily_events from anon, authenticated;
revoke all on analytics_daily_filters from anon, authenticated;
revoke all on analytics_daily_tender_opens from anon, authenticated;
revoke all on analytics_current_favorites from anon, authenticated;
revoke execute on function analytics_period_summary(timestamptz) from public, anon, authenticated;

grant insert, select on analytics_events to service_role;
grant usage, select on sequence analytics_events_id_seq to service_role;
grant select on analytics_daily_events to service_role;
grant select on analytics_daily_filters to service_role;
grant select on analytics_daily_tender_opens to service_role;
grant select on analytics_current_favorites to service_role;
grant execute on function analytics_period_summary(timestamptz) to service_role;
