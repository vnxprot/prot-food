-- Keep the first row for exact name + address duplicates and remove later
-- copies. This fixes the known duplicate Bún ốc cô Thêm (6 Hàng Chai).
delete from public.restaurants older
using public.restaurants newer
where older.ctid > newer.ctid
  and lower(trim(older.name)) = lower(trim(newer.name))
  and coalesce(lower(trim(older.address_raw)), '') = coalesce(lower(trim(newer.address_raw)), '');
