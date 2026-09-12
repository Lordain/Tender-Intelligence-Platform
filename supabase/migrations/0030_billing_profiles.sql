-- Server-managed billing identity used to prepare Stripe Customers, retain
-- the tax-location evidence captured at purchase time, and avoid creating a
-- second Stripe Customer when the same user later chooses bank transfer.
create table if not exists public.billing_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  buyer_type text not null check (buyer_type in ('individual', 'business')),
  legal_name text not null,
  billing_email text not null,
  country text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text,
  postal_code text not null,
  tax_id text,
  stripe_customer_id text unique,
  pending_payment_request_id uuid,
  pending_payment_kind text check (pending_payment_kind in ('card', 'bank_transfer')),
  pending_payment_reference_id text unique,
  pending_payment_url text,
  pending_payment_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_profiles enable row level security;

create policy "Users can view their own billing profile" on public.billing_profiles
  for select using (auth.uid() = user_id);

-- Writes intentionally have no user policy. Checkout writes through the
-- service-role client after authenticating the caller and validating every
-- field, so a browser cannot replace stripe_customer_id or another user's row.
