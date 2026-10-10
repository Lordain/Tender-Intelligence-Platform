-- Basic plan: two countries instead of one (user, 2026-10-10: 把当前的基础用户
-- 可以看的国家从 1 调整成 2).
--
-- The primary key was subscription_id, so a subscription could hold exactly one
-- row. Each row now takes a slot, 1 or 2, and the key becomes (subscription_id,
-- slot): the database itself refuses a third country, and two requests racing
-- for the same slot cannot both win. A country can still be chosen only once
-- per subscription.
--
-- No row is rewritten: every existing choice becomes slot 1 through the
-- column default, so a subscriber who picked one country keeps it and can add
-- a second. Safe to run before the code that reads two countries is deployed —
-- the live code inserts without a slot (default 1) and reads a single row,
-- which is all any subscription can have until that code ships.

alter table public.basic_plan_countries add column if not exists slot smallint not null default 1;
alter table public.basic_plan_countries drop constraint if exists basic_plan_countries_slot_check;
alter table public.basic_plan_countries add constraint basic_plan_countries_slot_check check (slot between 1 and 2);

alter table public.basic_plan_countries drop constraint if exists basic_plan_countries_pkey;
alter table public.basic_plan_countries add constraint basic_plan_countries_pkey primary key (subscription_id, slot);

alter table public.basic_plan_countries drop constraint if exists basic_plan_countries_subscription_country_key;
alter table public.basic_plan_countries add constraint basic_plan_countries_subscription_country_key unique (subscription_id, country);
