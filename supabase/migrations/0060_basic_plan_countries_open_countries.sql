-- Basic plan: every open country can be the plan's one country (2026-09-29).
--
-- 0055 created basic_plan_countries with country limited to the four open at
-- the time. Chile opened on 2026-09-25 and Argentina on 2026-09-29, and the
-- account page offers both, but the check refused them: a Basic subscriber
-- who picked Chile got 「国家保存失败」 and nothing was saved.
--
-- Only the constraint changes; no row is rewritten, and every row already
-- stored satisfies the wider check.

alter table public.basic_plan_countries drop constraint if exists basic_plan_countries_country_check;
alter table public.basic_plan_countries add constraint basic_plan_countries_country_check
  check (country in ('Mexico', 'Brazil', 'Colombia', 'Peru', 'Chile', 'Argentina'));
