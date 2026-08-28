-- Keep historical visit rows intact for safety. They are no longer part of the
-- current UI flow, which only creates ngon / khong_ngon assessments.
comment on table public.visit_logs is 'Legacy history retained for safety; not used by the simplified Prot Food interface.';
