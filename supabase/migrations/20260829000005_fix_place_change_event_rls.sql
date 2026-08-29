-- The audit trigger must be able to write its own event row when a public
-- client updates a restaurant. Keep the event table readable/writable under
-- the personal-app RLS model and run the trigger function as its owner.

alter table public.place_change_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'place_change_events'
      and policyname = 'public personal place changes'
  ) then
    create policy "public personal place changes"
      on public.place_change_events
      for all
      using (true)
      with check (true);
  end if;
end;
$$;

create or replace function public.log_place_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.name is distinct from new.name
    or old.address_raw is distinct from new.address_raw
    or old.lat is distinct from new.lat
    or old.lng is distinct from new.lng then
    insert into public.place_change_events (restaurant_id, old_values, new_values)
    values (
      new.id,
      jsonb_strip_nulls(jsonb_build_object(
        'name', old.name,
        'address', old.address_raw,
        'lat', old.lat,
        'lng', old.lng
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'name', new.name,
        'address', new.address_raw,
        'lat', new.lat,
        'lng', new.lng
      ))
    );
  end if;

  return new;
end;
$$;
