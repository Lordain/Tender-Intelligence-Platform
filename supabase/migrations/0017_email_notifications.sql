-- Per-user matching rules for scheduled tender digests. Delivery rows are
-- server-only: a user can edit their own preferences but never inspect
-- another subscriber's address, matches, or delivery history.

create table if not exists email_notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  countries text[] not null default '{}',
  industries text[] not null default '{}',
  statuses text[] not null default '{}',
  relevance_tiers text[] not null default '{}',
  timezone text not null default 'America/Mexico_City',
  updated_at timestamptz not null default now()
);

create table if not exists tender_digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slot_key text not null,
  tender_ids uuid[] not null default '{}',
  status text not null check (status in ('processing', 'sent', 'failed')),
  resend_email_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, slot_key)
);

create index if not exists tender_digest_deliveries_slot_idx
  on tender_digest_deliveries (slot_key, status);

alter table email_notification_preferences enable row level security;
alter table tender_digest_deliveries enable row level security;

create policy "Users can view their own notification preferences"
  on email_notification_preferences for select using (auth.uid() = user_id);
create policy "Users can create their own notification preferences"
  on email_notification_preferences for insert with check (auth.uid() = user_id);
create policy "Users can update their own notification preferences"
  on email_notification_preferences for update using (auth.uid() = user_id);

revoke all on tender_digest_deliveries from anon, authenticated;
grant all on email_notification_preferences to service_role;
grant all on tender_digest_deliveries to service_role;
