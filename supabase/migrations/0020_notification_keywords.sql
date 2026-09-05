-- Optional per-user keyword rules. An empty array means keyword matching is
-- unrestricted; otherwise a tender must match at least one saved keyword.

alter table email_notification_preferences
  add column if not exists keywords text[] not null default '{}';

alter table email_notification_preferences
  add constraint email_notification_preferences_keywords_limit
  check (cardinality(keywords) <= 20);
