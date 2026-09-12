-- An enterprise seat now requires the invitee's consent.
--
-- Before this, an owner typing any address into 企业账户 granted that address
-- a full subscriber entitlement: the signup trigger bound the row to whoever
-- registered with it, and getViewerEntitlement() also matched on the email
-- string alone. A mistyped address handed a stranger a paid seat, and the
-- person named had no say and no way to see it had happened.
alter table public.enterprise_members
  add column if not exists status text not null default 'pending',
  add column if not exists responded_at timestamptz;

alter table public.enterprise_members drop constraint if exists enterprise_members_status_check;
alter table public.enterprise_members add constraint enterprise_members_status_check
  check (status in ('pending', 'accepted', 'declined'));

-- Nobody has consented to anything yet, so every existing row starts over as
-- an invitation. Seats that were live before this migration stop granting
-- access until the invitee accepts.
update public.enterprise_members set status = 'pending', responded_at = null;

-- One person, one accepted seat — but any number of PENDING invitations.
-- The old index was unique on member_user_id regardless of status, which
-- meant the signup trigger below (it links every row matching the new
-- address) raised a unique violation and aborted the whole signup whenever
-- two different companies had invited the same person. Being invited twice
-- is normal; holding two seats is not.
drop index if exists public.enterprise_members_member_user_idx;
create unique index if not exists enterprise_members_accepted_member_idx
  on public.enterprise_members (member_user_id)
  where member_user_id is not null and status = 'accepted';

-- Unchanged in effect, restated for clarity: signup only BINDS an invitation
-- to the new account so the person can find it. It does not accept it.
create or replace function public.link_enterprise_member_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.enterprise_members set member_user_id = new.id
  where member_user_id is null and status = 'pending' and lower(email) = lower(new.email);
  return new;
end;
$$;
