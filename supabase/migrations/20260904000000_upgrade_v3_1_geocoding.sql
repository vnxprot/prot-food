-- Prot Food v3.1.0: street-level matches are routeable but remain distinct
-- from exact house-number and manually verified coordinates.
alter table public.restaurants
  drop constraint if exists restaurants_geocode_confidence_check;

alter table public.restaurants
  add constraint restaurants_geocode_confidence_check
  check (geocode_confidence in ('high', 'medium', 'low', 'manual'));

alter table public.restaurants
  drop constraint if exists restaurants_geocode_source_check;

alter table public.restaurants
  add constraint restaurants_geocode_source_check
  check (geocode_source in ('nominatim', 'plus_code', 'manual', 'unset'));
