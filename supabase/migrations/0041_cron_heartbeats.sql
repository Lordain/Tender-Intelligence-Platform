-- Cron heartbeats (2026-09-11).
--
-- The failure the existing alerting cannot see: a scheduled job that never
-- runs at all. Every other monitor in this project is written by code inside
-- a job — a Stripe webhook that threw, a reminder email that bounced — so a
-- cron that stops firing (Vercel schedule not deployed, CRON_SECRET rotated
-- and now returning 401, the project moved) produces exactly nothing, and
-- "no errors" and "no runs" look identical from the admin banner.
--
-- One row per job, rewritten on every run. The row records that the
-- SCHEDULER reached the route, which is why a deliberate skip (digest called
-- outside its 09:00/18:00 slot, notifications disabled) still writes one with
-- status 'skipped': the job ran, it just had nothing to do. Only 'failed' and
-- an absent/old timestamp mean something is wrong.
create table if not exists cron_heartbeats (
  job text primary key,
  last_run_at timestamptz not null default now(),
  status text not null default 'ok' check (status in ('ok', 'skipped', 'failed')),
  detail text,
  updated_at timestamptz not null default now()
);

alter table cron_heartbeats enable row level security;

-- Same posture as admin_alerts: all writes go through the service-role key,
-- which bypasses RLS. This policy exists so the anon/public key sees nothing.
create policy "cron_heartbeats no public access" on cron_heartbeats
  for all using (false);
