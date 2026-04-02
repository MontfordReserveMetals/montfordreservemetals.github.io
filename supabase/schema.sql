create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intake_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  metal_type text not null default 'gold',
  item_summary text not null,
  claimed_karat text not null default 'mixed',
  claimed_weight_grams numeric(10,2),
  house_buy_price_per_ounce numeric(10,2),
  market_spot_per_ounce numeric(10,2),
  market_source text,
  market_snapshot_at timestamptz,
  estimated_quote numeric(10,2),
  preferred_settlement text,
  notes text,
  status text not null default 'new' check (
    status in ('new', 'reviewed', 'contacted', 'converted', 'closed')
  ),
  source text not null default 'website',
  source_page text,
  created_at timestamptz not null default now()
);

create table if not exists public.market_price_cache (
  metal_type text primary key check (metal_type in ('gold', 'silver', 'platinum', 'palladium')),
  spot_price_per_ounce_usd numeric(12,4) not null,
  currency text not null default 'USD',
  unit text not null default 'toz',
  source text not null default 'metals.dev',
  fetched_at timestamptz not null,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reference_code text not null unique default ('MRM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  metal_type text not null default 'gold',
  item_summary text not null,
  claimed_karat text not null default 'mixed',
  claimed_weight_grams numeric(10,2),
  estimated_quote numeric(10,2),
  house_buy_price_per_ounce numeric(10,2),
  market_spot_per_ounce numeric(10,2),
  market_source text,
  market_snapshot_at timestamptz,
  status text not null default 'submitted' check (
    status in (
      'submitted',
      'awaiting_shipment',
      'in_transit',
      'received',
      'inspection_complete',
      'offer_sent',
      'accepted',
      'paid',
      'returned'
    )
  ),
  status_detail text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  carrier text,
  tracking_number text,
  status text not null default 'awaiting_shipment' check (
    status in ('awaiting_shipment', 'label_sent', 'in_transit', 'received')
  ),
  insured_value numeric(10,2),
  label_sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  final_offer numeric(10,2) not null,
  notes text,
  sent_at timestamptz not null default now(),
  expires_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  amount numeric(10,2) not null,
  method text not null,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'paid', 'failed', 'returned')
  ),
  reference_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_quotes_updated_at on public.quotes;
create trigger set_quotes_updated_at
before update on public.quotes
for each row execute function public.set_updated_at();

drop trigger if exists set_market_price_cache_updated_at on public.market_price_cache;
create trigger set_market_price_cache_updated_at
before update on public.market_price_cache
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.intake_requests enable row level security;
alter table public.market_price_cache enable row level security;
alter table public.quotes enable row level security;
alter table public.shipments enable row level security;
alter table public.offers enable row level security;
alter table public.payouts enable row level security;

drop policy if exists "Public can submit intake requests" on public.intake_requests;
create policy "Public can submit intake requests"
on public.intake_requests
for insert
to anon, authenticated
with check (
  length(trim(full_name)) > 1
  and length(trim(email)) > 3
  and length(trim(item_summary)) > 2
  and coalesce(claimed_weight_grams, 0) >= 0
);

drop policy if exists "Public can view cached market prices" on public.market_price_cache;
create policy "Public can view cached market prices"
on public.market_price_cache
for select
to anon, authenticated
using (true);

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "Users can view own quotes" on public.quotes;
create policy "Users can view own quotes"
on public.quotes
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own quotes" on public.quotes;
create policy "Users can insert own quotes"
on public.quotes
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can view own shipments" on public.shipments;
create policy "Users can view own shipments"
on public.shipments
for select
using (
  exists (
    select 1
    from public.quotes
    where quotes.id = shipments.quote_id
      and quotes.user_id = auth.uid()
  )
);

drop policy if exists "Users can view own offers" on public.offers;
create policy "Users can view own offers"
on public.offers
for select
using (
  exists (
    select 1
    from public.quotes
    where quotes.id = offers.quote_id
      and quotes.user_id = auth.uid()
  )
);

drop policy if exists "Users can view own payouts" on public.payouts;
create policy "Users can view own payouts"
on public.payouts
for select
using (
  exists (
    select 1
    from public.quotes
    where quotes.id = payouts.quote_id
      and quotes.user_id = auth.uid()
  )
);

comment on table public.quotes is 'Customer-submitted or staff-created gold quote records.';
comment on table public.intake_requests is 'Public website lead intake. Review manually before creating or linking customer quotes.';
comment on table public.market_price_cache is 'Server-managed cached metals prices used by private payout logic.';
comment on table public.shipments is 'Shipment state for each quote.';
comment on table public.offers is 'Final reviewed offers issued to customers.';
comment on table public.payouts is 'Settlement records. Keep automated payout logic off the frontend.';
