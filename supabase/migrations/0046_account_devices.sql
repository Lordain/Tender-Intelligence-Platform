-- Cap how many browsers can be signed into one account at a time.
--
-- Why a table of our own rather than Supabase's sessions: the admin API
-- (@supabase/auth-js GoTrueAdminApi) exposes only signOut(jwt, scope), and
-- that jwt is the session's own — a server holding the service role still
-- cannot enumerate or revoke another browser's session. auth.sessions is
-- readable with the service role but it is Supabase's internal schema, and
-- deleting rows there to evict a device would break on their next upgrade.
--
-- A "device" here is a browser profile: the id lives in localStorage, the
-- same mechanism the analytics session id already uses. Clearing site data
-- or opening a private window therefore mints a new one, so this counts
-- browsers generously — which is why the limit evicts rather than blocks,
-- and why the owner can remove a device themselves.
create table if not exists account_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  -- Shown to the owner so they can tell which row is the laptop they lost.
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Set when the device is evicted by the limit or removed by the owner.
  -- Rows are kept rather than deleted: a returning browser re-registers
  -- under the same device_id, and its first_seen_at is worth keeping.
  revoked_at timestamptz,
  unique (user_id, device_id),
  check (char_length(coalesce(user_agent, '')) <= 400)
);

-- The eviction query: active devices for one user, oldest-seen first.
create index if not exists account_devices_active_idx
  on account_devices (user_id, last_seen_at desc)
  where revoked_at is null;

alter table account_devices enable row level security;

-- The owner may read their own devices; every write goes through the
-- service role in app/api/account/devices, which is what enforces the cap.
drop policy if exists "read own devices" on account_devices;
create policy "read own devices" on account_devices
  for select using (auth.uid() = user_id);
