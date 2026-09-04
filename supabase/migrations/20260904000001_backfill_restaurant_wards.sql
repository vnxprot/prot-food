-- Keep current (post-2025) Hanoi wards searchable by common street and legacy
-- ward names, then repair restaurants that already contain those addresses.
update public.admin_wards
set old_names = array(
  select distinct unnest(coalesce(old_names, '{}') || array['Ngọc Lâm', 'Gia Thụy', 'Ngọc Thụy'])
)
where name = 'Phường Bồ Đề';

update public.admin_wards
set old_names = array(
  select distinct unnest(coalesce(old_names, '{}') || array['Ngô Tất Tố'])
)
where name = 'Phường Văn Miếu - Quốc Tử Giám';

update public.admin_wards
set old_names = array(
  select distinct unnest(coalesce(old_names, '{}') || array['Nguyễn Phong Sắc', 'Dịch Vọng', 'Dịch Vọng Hậu'])
)
where name = 'Phường Cầu Giấy';

update public.admin_wards
set old_names = array(
  select distinct unnest(coalesce(old_names, '{}') || array['Hương Viên', 'Đồng Nhân'])
)
where name = 'Phường Hai Bà Trưng';

update public.admin_wards
set old_names = array(
  select distinct unnest(coalesce(old_names, '{}') || array['Nguyễn Trung Trực'])
)
where name = 'Phường Ba Đình';

update public.admin_wards
set old_names = array(
  select distinct unnest(coalesce(old_names, '{}') || array['Trần Quang Diệu'])
)
where name = 'Phường Ô Chợ Dừa';

update public.restaurants r
set ward_id = w.id
from public.admin_wards w
where r.ward_id is null
  and exists (
    select 1
    from unnest(coalesce(w.old_names, '{}')) alias
    where lower(coalesce(r.address_raw, '')) like '%' || lower(alias) || '%'
  );

-- This restaurant was already saved before the relaxed geocoder existed.
-- The coordinates and current ward were verified against its published map listing.
update public.restaurants r
set lat = 21.0460338,
    lng = 105.8705704,
    geocode_source = 'manual',
    geocode_confidence = 'manual',
    ward_id = w.id,
    location_verification = 'verified',
    last_verified_at = current_date,
    next_review_at = current_date + interval '180 days'
from public.admin_wards w
where r.id = 'bb0ef968-5246-43e5-a8ba-ce840080cffc'
  and w.name = 'Phường Bồ Đề';
