-- When a tender first appeared on the public site (2026-10-04).
--
-- A tender is public only once it has analysis logged — at least one
-- tender_requirements or tender_risks row (fetchAllTendersFromDb,
-- lib/db/tenders.ts). Analysis is imported by hand, often a day or more after
-- the row itself was imported, so 24小时新增 — measured from created_at —
-- missed every tender whose analysis landed more than 24 hours after its
-- import: it appeared on the site that day and was never counted as new
-- (user, 2026-10-04: 如果是在24小时内录入的项目也算).
--
-- listed_at is stamped by a trigger the first time an analysis row is
-- inserted for the tender, whichever path writes it (batch analysis import,
-- document upload, the admin editors). It is never moved afterwards.
--
-- Existing analysed rows are backfilled with created_at: the real moment is
-- not recorded anywhere, and created_at keeps them out of today's count
-- rather than flooding it.

alter table public.tenders add column if not exists listed_at timestamptz;

update public.tenders t
set listed_at = t.created_at
where t.listed_at is null
  and (
    exists (select 1 from public.tender_requirements r where r.tender_id = t.id)
    or exists (select 1 from public.tender_risks k where k.tender_id = t.id)
  );

create or replace function public.mark_tender_listed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tenders set listed_at = now() where id = new.tender_id and listed_at is null;
  return new;
end;
$$;

drop trigger if exists tender_requirements_mark_listed on public.tender_requirements;
create trigger tender_requirements_mark_listed
  after insert on public.tender_requirements
  for each row execute function public.mark_tender_listed();

drop trigger if exists tender_risks_mark_listed on public.tender_risks;
create trigger tender_risks_mark_listed
  after insert on public.tender_risks
  for each row execute function public.mark_tender_listed();
