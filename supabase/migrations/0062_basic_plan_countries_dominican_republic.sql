-- Basic plan: the Dominican Republic can be the plan's one country
-- (2026-10-04, when it opened to visitors). Same change as 0060 made for
-- Chile and Argentina; only the constraint changes and no row is rewritten.

alter table public.basic_plan_countries drop constraint if exists basic_plan_countries_country_check;
alter table public.basic_plan_countries add constraint basic_plan_countries_country_check
  check (country in ('Mexico', 'Brazil', 'Colombia', 'Peru', 'Chile', 'Argentina', 'Dominican Republic'));
