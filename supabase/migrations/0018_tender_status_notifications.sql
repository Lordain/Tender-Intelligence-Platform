-- Keep a small, append-only audit trail only for real tender status changes.
-- Normal re-ingestion updates no longer look like a notification event.

create table if not exists tender_status_history (
  id bigint generated always as identity primary key,
  tender_id uuid not null references tenders (id) on delete cascade,
  previous_status text not null,
  next_status text not null,
  changed_at timestamptz not null default now()
);

create index if not exists tender_status_history_changed_at_idx
  on tender_status_history (changed_at desc);

create or replace function record_tender_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into tender_status_history (tender_id, previous_status, next_status)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists tender_status_change_trigger on tenders;
create trigger tender_status_change_trigger
  after update of status on tenders
  for each row execute function record_tender_status_change();

alter table tender_status_history enable row level security;
revoke all on tender_status_history from anon, authenticated;
grant select, insert on tender_status_history to service_role;
grant usage, select on sequence tender_status_history_id_seq to service_role;
