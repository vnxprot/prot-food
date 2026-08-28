-- Keep historical visit rows intact for safety. They are no longer part of the
-- current UI flow, which uses one status and one optional taste assessment.
update public.restaurants
set taste_rating = null
where taste_rating = 'binh_thuong';

comment on table public.visit_logs is 'Legacy history retained for safety; not used by the simplified Prot Food interface.';
