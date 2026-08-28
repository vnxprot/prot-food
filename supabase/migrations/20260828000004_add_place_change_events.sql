create table if not exists public.place_change_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  old_values jsonb not null,
  new_values jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists place_change_events_restaurant_created_idx
  on public.place_change_events(restaurant_id, created_at desc);

alter table public.place_change_events enable row level security;
create policy "public personal place changes" on public.place_change_events for all using (true) with check (true);

create or replace function public.log_place_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.name is distinct from new.name
    or old.address_raw is distinct from new.address_raw
    or old.lat is distinct from new.lat
    or old.lng is distinct from new.lng then
    insert into public.place_change_events (restaurant_id, old_values, new_values)
    values (
      new.id,
      jsonb_strip_nulls(jsonb_build_object('name', old.name, 'address', old.address_raw, 'lat', old.lat, 'lng', old.lng)),
      jsonb_strip_nulls(jsonb_build_object('name', new.name, 'address', new.address_raw, 'lat', new.lat, 'lng', new.lng))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists restaurants_place_change_log on public.restaurants;
create trigger restaurants_place_change_log
after update on public.restaurants
for each row execute procedure public.log_place_change();
