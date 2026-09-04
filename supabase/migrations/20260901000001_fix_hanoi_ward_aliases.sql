-- v3.0.1: improve ward matching for street aliases used by the food seed.
update public.admin_wards
set old_names = array(select distinct unnest(old_names || array['Vũ Thạnh', 'Hào Nam']))
where name = 'Phường Ô Chợ Dừa';

update public.admin_wards
set old_names = array(select distinct unnest(old_names || array['Hoàng Hoa Thám']))
where name = 'Phường Ba Đình';

-- Backfill restaurants that were previously geocoded without a ward relation.
update public.restaurants r
set ward_id = w.id
from public.admin_wards w
where r.ward_id is null
  and exists (
    select 1 from unnest(coalesce(w.old_names, '{}')) alias
    where lower(coalesce(r.address_raw, '')) like '%' || lower(alias) || '%'
  );
