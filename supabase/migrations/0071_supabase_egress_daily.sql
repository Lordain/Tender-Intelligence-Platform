-- The platform's own count of what it reads from Supabase, per UTC day
-- (2026-11-03, user: A. 平台自己记账). Written by lib/ops/supabase-egress.ts
-- through add_supabase_egress(); read by app/api/cron/supabase-egress-check,
-- which emails the admin before the Free plan's 5 GB egress runs out.
-- Service role only: RLS on with no policies, the function granted to
-- service_role alone. Nothing existing changes.

create table if not exists public.supabase_egress_daily (
  day date primary key,
  bytes bigint not null default 0,
  requests integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.supabase_egress_daily enable row level security;

create or replace function public.add_supabase_egress(p_day date, p_bytes bigint, p_requests integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.supabase_egress_daily (day, bytes, requests, updated_at)
  values (p_day, greatest(p_bytes, 0), greatest(p_requests, 0), now())
  on conflict (day) do update
    set bytes = supabase_egress_daily.bytes + excluded.bytes,
        requests = supabase_egress_daily.requests + excluded.requests,
        updated_at = now();
$$;

revoke all on function public.add_supabase_egress(date, bigint, integer) from public, anon, authenticated;
grant execute on function public.add_supabase_egress(date, bigint, integer) to service_role;
