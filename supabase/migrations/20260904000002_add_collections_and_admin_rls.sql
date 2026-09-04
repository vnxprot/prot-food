-- Migration: Add collections and role-based access control (RLS)
-- Version: v3.2.0

-- 1. Create collections table
create table if not exists public.collections (
  id text primary key,
  name text not null,
  icon text not null default '🍜',
  type text not null default 'food' check (type in ('food', 'cafe', 'all')),
  owner_name text not null default 'Prot',
  source_type text not null default 'manual' check (source_type in ('manual', 'excel', 'google_sheets')),
  google_sheets_url text,
  description text,
  is_default boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- The first draft of this migration shipped before import provenance was
-- added. These are idempotent for databases where the table already exists.
alter table public.collections add column if not exists source_type text not null default 'manual';
alter table public.collections add column if not exists google_sheets_url text;
alter table public.collections add column if not exists updated_at timestamptz default now();

-- 2. Seed initial collections for 3 data sources
insert into public.collections (id, name, icon, type, owner_name, description, is_default, sort_order)
values
  ('prot_food', 'Quán ăn của Prot', '🍜', 'food', 'Prot', 'Danh sách quán ăn tinh tuyển của Prot', true, 1),
  ('person_a_cafe', 'Cafe Người A', '☕', 'cafe', 'Người A', 'Danh sách quán cafe & trà đặc sắc của Người A', false, 2),
  ('person_b_food', 'Quán ngon Người B', '🍱', 'food', 'Người B', 'Bộ sưu tập quán ăn khám phá của Người B', false, 3)
on conflict (id) do nothing;

-- 3. Add collection_id to restaurants
alter table public.restaurants
  add column if not exists collection_id text references public.collections(id) default 'prot_food';

create index if not exists restaurants_collection_id_idx on public.restaurants(collection_id);

-- 4. Enable RLS on collections
alter table public.collections enable row level security;

-- Public can read collections
drop policy if exists "public read collections" on public.collections;
create policy "public read collections" on public.collections for select using (true);

-- Only authenticated admin can modify collections
drop policy if exists "admin modify collections" on public.collections;
create policy "admin modify collections" on public.collections for all
using (
  auth.role() = 'authenticated' and 
  (auth.jwt() ->> 'email' = 'vnxprot@gmail.com' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
)
with check (
  auth.role() = 'authenticated' and 
  (auth.jwt() ->> 'email' = 'vnxprot@gmail.com' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
);

-- 5. Update RLS on restaurants for Admin vs Public Viewer
drop policy if exists "public personal restaurants" on public.restaurants;
drop policy if exists "public read restaurants" on public.restaurants;
drop policy if exists "admin write restaurants" on public.restaurants;

-- Public read for all restaurants
create policy "public read restaurants" on public.restaurants for select using (true);

-- Admin only write (insert/update/delete)
create policy "admin write restaurants" on public.restaurants for all
using (
  auth.role() = 'authenticated' and 
  (auth.jwt() ->> 'email' = 'vnxprot@gmail.com' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
)
with check (
  auth.role() = 'authenticated' and 
  (auth.jwt() ->> 'email' = 'vnxprot@gmail.com' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
);
