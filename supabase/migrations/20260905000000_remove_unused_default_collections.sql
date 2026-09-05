-- Remove the two placeholder sources. Existing restaurants are preserved by
-- moving them back to the primary Prot collection before deleting the source.
update public.restaurants
set collection_id = 'prot_food'
where collection_id in ('person_a_cafe', 'person_b_food');

delete from public.collections
where id in ('person_a_cafe', 'person_b_food');
