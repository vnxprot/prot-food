create extension if not exists pgcrypto;

create table if not exists public.admin_wards (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('phuong', 'xa')),
  old_names text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shop_note text,
  address_raw text,
  lat double precision,
  lng double precision,
  geocode_source text check (geocode_source in ('nominatim', 'manual', 'unset')) default 'unset',
  geocode_confidence text check (geocode_confidence in ('high', 'low', 'manual')) default 'low',
  ward_id uuid references public.admin_wards(id),
  category text,
  price_level text check (price_level in ('re', 'binh_thuong', 'dat')),
  taste_rating text check (taste_rating in ('ngon', 'binh_thuong', 'khong_ngon')),
  status text not null check (status in ('muon_den', 'da_den')) default 'muon_den',
  last_visited_at date,
  visit_count int not null default 0 check (visit_count >= 0),
  notes text,
  is_duplicate_of uuid references public.restaurants(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.visit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  visited_at date not null,
  taste_rating text check (taste_rating in ('ngon', 'binh_thuong', 'khong_ngon')),
  price_level text check (price_level in ('re', 'binh_thuong', 'dat')),
  note text,
  created_at timestamptz default now()
);

create index if not exists restaurants_ward_id_idx on public.restaurants(ward_id);
create index if not exists restaurants_status_idx on public.restaurants(status);
create index if not exists visit_logs_restaurant_id_idx on public.visit_logs(restaurant_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists restaurants_updated_at on public.restaurants;
create trigger restaurants_updated_at before update on public.restaurants for each row execute procedure public.set_updated_at();

create or replace function public.sync_visit_snapshot()
returns trigger language plpgsql as $$
begin
  update public.restaurants
  set status = 'da_den', last_visited_at = new.visited_at,
      visit_count = (select count(*) from public.visit_logs where restaurant_id = new.restaurant_id),
      taste_rating = new.taste_rating, price_level = new.price_level
  where id = new.restaurant_id;
  return new;
end;
$$;

drop trigger if exists visit_logs_snapshot on public.visit_logs;
create trigger visit_logs_snapshot after insert on public.visit_logs for each row execute procedure public.sync_visit_snapshot();

alter table public.admin_wards enable row level security;
alter table public.restaurants enable row level security;
alter table public.visit_logs enable row level security;

create policy "public personal admin wards" on public.admin_wards for all using (true) with check (true);
create policy "public personal restaurants" on public.restaurants for all using (true) with check (true);
create policy "public personal visits" on public.visit_logs for all using (true) with check (true);

comment on table public.admin_wards is 'TODO: Expand seed to all 126 Hanoi commune-level units effective 2025-07-01.';
