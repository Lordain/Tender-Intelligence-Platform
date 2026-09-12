-- Adds a key-date type for "this mechanism stops accepting anything on this
-- date", which is not the same as a bid submission deadline.
--
-- PEMEX's Concursos Abiertos items carry `vencimiento`, and the mapper
-- deliberately refuses to surface it as submissionDeadline: real data has it
-- one to two years past `inicio` (created 2026-08-27, vencimiento 2028-08-27),
-- because a Concurso Abierto is a standing invitation with a validity window,
-- not a one-shot bid round. Calling that a 交标截止日 would tell a bidder they
-- have until 2028.
--
-- The result was that PEMEX tenders reached the site with an empty 关键日期
-- section while the source held two perfectly good dates (user, 2026-09-12:
-- Pemex项目也没有关键日期). This type lets the real one be shown under its real
-- meaning instead of being thrown away or mislabelled.
--
-- The type list lives in a CHECK constraint created inline by 0001_init, so
-- Postgres named it itself; it is looked up by name here rather than assumed.
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where rel.relname = 'tender_key_dates'
    and nsp.nspname = 'public'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%contract_signing%';

  if constraint_name is not null then
    execute format('alter table tender_key_dates drop constraint %I', constraint_name);
  end if;
end $$;

alter table tender_key_dates
  add constraint tender_key_dates_type_check check (
    type in (
      'publication', 'site_visit', 'questions_deadline', 'clarification',
      'submission', 'opening', 'award', 'contract_signing', 'validity_end'
    )
  );
