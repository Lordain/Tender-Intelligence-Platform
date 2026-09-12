-- Seven-day no-card trial and enterprise seats (owner + two invited accounts).
alter table public.profiles add column if not exists trial_ends_at timestamptz;

-- Existing registered users receive a fresh launch trial; future profiles use signup time.
update public.profiles set trial_ends_at = now() + interval '7 days' where trial_ends_at is null;
alter table public.profiles alter column trial_ends_at set default (now() + interval '7 days');
alter table public.profiles alter column trial_ends_at set not null;

create table if not exists public.enterprise_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  member_user_id uuid references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  constraint enterprise_member_not_owner check (member_user_id is null or member_user_id <> owner_user_id)
);

create unique index if not exists enterprise_members_owner_email_idx on public.enterprise_members (owner_user_id, lower(email));
create unique index if not exists enterprise_members_member_user_idx on public.enterprise_members (member_user_id) where member_user_id is not null;
alter table public.enterprise_members enable row level security;
revoke all on public.enterprise_members from anon, authenticated;
grant all on public.enterprise_members to service_role;

create or replace function public.link_enterprise_member_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.enterprise_members set member_user_id = new.id
  where member_user_id is null and lower(email) = lower(new.email);
  return new;
end;
$$;

drop trigger if exists link_enterprise_member_after_signup on auth.users;
create trigger link_enterprise_member_after_signup after insert on auth.users
for each row execute procedure public.link_enterprise_member_on_signup();
