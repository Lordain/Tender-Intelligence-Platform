-- Admin-facing alert log (2026-09-04, per the user's request): "token 消
-- 耗完了，或者 API 连接有问题" — a real Anthropic/DashScope quota/rate-
-- limit error or a network failure from one of the admin web tools
-- (translate-tenders, analyze-document) gets logged here instead of only
-- ever showing as a one-off error box on whatever page happened to be
-- open. AdminShell reads unresolved rows and renders a banner on every
-- /admin/* page — see lib/admin-alerts.ts.
create table if not exists admin_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('quota', 'connection', 'other')),
  message text not null,
  source text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists admin_alerts_unresolved_idx on admin_alerts (created_at desc) where resolved_at is null;

alter table admin_alerts enable row level security;

-- Same posture as every other admin-only table in this project: writes
-- go through the service-role key (createSupabaseAdminClient()), which
-- bypasses RLS entirely — this policy only matters for the anon/public
-- key, which should never see this table at all.
create policy "admin_alerts no public access" on admin_alerts
  for all using (false);
