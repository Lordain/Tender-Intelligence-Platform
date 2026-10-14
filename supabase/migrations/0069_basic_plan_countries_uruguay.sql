-- Basic plan: Uruguay can be one of the plan's countries (2026-10-14, when it
-- opened to visitors). Same change as 0066 made for Bolivia; only the
-- constraint changes and no row is rewritten.

alter table public.basic_plan_countries drop constraint if exists basic_plan_countries_country_check;
alter table public.basic_plan_countries add constraint basic_plan_countries_country_check
  check (country in ('Mexico', 'Brazil', 'Colombia', 'Peru', 'Chile', 'Argentina', 'Dominican Republic', 'Panama', 'Ecuador', 'Bolivia', 'Uruguay'));
