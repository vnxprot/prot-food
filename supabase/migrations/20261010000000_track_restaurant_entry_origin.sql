do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurants' and column_name = 'entry_origin'
  ) then
    alter table public.restaurants
      add column entry_origin text not null default 'manual'
      check (entry_origin in ('manual', 'import'));

    -- Manual creation previously always used the default Prot collection.
    update public.restaurants as r
    set entry_origin = 'import'
    from public.collections as c
    where r.collection_id = c.id
      and c.source_type in ('excel', 'google_sheets');
  end if;
end $$;

create index if not exists restaurants_collection_origin_idx
  on public.restaurants (collection_id, entry_origin);
