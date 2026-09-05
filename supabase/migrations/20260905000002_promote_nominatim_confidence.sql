-- Existing coordinates from Nominatim are usable for routing. Promote legacy
-- imports that were stored as low confidence before the stricter importer.
update public.restaurants
set geocode_confidence = 'high'
where geocode_source = 'nominatim'
  and geocode_confidence = 'low'
  and lat is not null
  and lng is not null;
