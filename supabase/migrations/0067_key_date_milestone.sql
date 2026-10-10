-- Adds a key-date type for any other dated step of a published schedule.
--
-- A ProInversión concurso's bases carry fifteen dated steps — participation
-- fee, qualification request, three rounds of draft contracts, consortium
-- changes — and the platform had a type for two of them (user, 2026-10-10:
-- 要匹配我上面提供的日期 … 还涉及报名费). A "milestone" row is named by its
-- own notes and is shown only as a card under 其他时间安排与节点说明; nothing
-- reads it for status or deadlines.
--
-- Same lookup-by-definition as 0044: the constraint was named by Postgres.
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
      'submission', 'opening', 'award', 'contract_signing', 'validity_end',
      'milestone'
    )
  );
