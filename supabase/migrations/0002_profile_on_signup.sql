-- Auto-creates a public.profiles row whenever a new user signs up via
-- Supabase Auth. SECURITY DEFINER so it can insert despite the profiles
-- table's RLS (a fresh user has no session yet at the moment of insert).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
