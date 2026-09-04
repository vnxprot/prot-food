-- Prot Food v3.0.0: normalize legacy data and seed the 126 Hanoi commune-level
-- administrative units (51 wards and 75 communes, effective 2025-07-01).

alter table public.restaurants
  drop constraint if exists restaurants_location_verification_check;

update public.restaurants
set location_verification = 'unverified'
where location_verification = 'needs_review';

alter table public.restaurants
  alter column location_verification set default 'unverified';

alter table public.restaurants
  add constraint restaurants_location_verification_check
  check (location_verification in ('verified', 'unverified', 'closed'));

-- v3 intentionally has two explicit taste choices. Preserve the restaurant and
-- visit history while treating the former neutral choice as no current rating.
update public.restaurants set taste_rating = null where taste_rating = 'binh_thuong';
update public.visit_logs set taste_rating = null where taste_rating = 'binh_thuong';

alter table public.restaurants drop constraint if exists restaurants_taste_rating_check;
alter table public.restaurants add constraint restaurants_taste_rating_check
  check (taste_rating in ('ngon', 'khong_ngon'));
alter table public.visit_logs drop constraint if exists visit_logs_taste_rating_check;
alter table public.visit_logs add constraint visit_logs_taste_rating_check
  check (taste_rating in ('ngon', 'khong_ngon'));

alter table public.visit_logs alter column visited_at set default current_date;

alter table public.review_queue
  alter column due_at type timestamptz using due_at::timestamptz,
  alter column due_at set default now();

-- This list is sourced from Appendix II of Decision 19/2025/QD-TTg. `old_names`
-- is expanded incrementally as addresses are reviewed; named legacy areas below
-- retain the existing Hanoi food-list mapping.
insert into public.admin_wards (name, type, old_names) values
  ('Phường Hoàn Kiếm', 'phuong', array['Hoàn Kiếm', 'Hàng Chai', 'Hàng Chiếu', 'Hàng Giấy', 'Lãn Ông', 'Phùng Hưng', 'Phúc Tân']),
  ('Phường Cửa Nam', 'phuong', array['Cửa Nam']),
  ('Phường Ba Đình', 'phuong', array['Ba Đình', 'Quán Thánh', 'Đội Cấn', 'Trúc Bạch', 'Văn Cao', 'Quần Ngựa']),
  ('Phường Ngọc Hà', 'phuong', array['Ngọc Hà']),
  ('Phường Giảng Võ', 'phuong', array['Giảng Võ', 'Ngọc Khánh', 'Vạn Phúc']),
  ('Phường Hai Bà Trưng', 'phuong', array['Hai Bà Trưng', 'Phố Huế', 'Bạch Mai', 'Hoà Mã', 'Thái Phiên']),
  ('Phường Vĩnh Tuy', 'phuong', array['Vĩnh Tuy']),
  ('Phường Bạch Mai', 'phuong', array['Bạch Mai']),
  ('Phường Đống Đa', 'phuong', array['Đống Đa', 'Nguyễn Thượng Hiền']),
  ('Phường Kim Liên', 'phuong', array['Kim Liên', 'Đông Tác', 'Khương Thượng']),
  ('Phường Văn Miếu - Quốc Tử Giám', 'phuong', array['Văn Miếu', 'Điện Biên Phủ']),
  ('Phường Láng', 'phuong', array['Láng']),
  ('Phường Ô Chợ Dừa', 'phuong', array['Ô Chợ Dừa', 'Hoàng Cầu', 'Hào Nam', 'Thái Thịnh']),
  ('Phường Hồng Hà', 'phuong', array['Hồng Hà']),
  ('Phường Lĩnh Nam', 'phuong', array['Lĩnh Nam']),
  ('Phường Hoàng Mai', 'phuong', array['Hoàng Mai']),
  ('Phường Vĩnh Hưng', 'phuong', array['Vĩnh Hưng']),
  ('Phường Tương Mai', 'phuong', array['Tương Mai']),
  ('Phường Định Công', 'phuong', array['Định Công']),
  ('Phường Hoàng Liệt', 'phuong', array['Hoàng Liệt']),
  ('Phường Yên Sở', 'phuong', array['Yên Sở']),
  ('Phường Thanh Xuân', 'phuong', array['Thanh Xuân']),
  ('Phường Khương Đình', 'phuong', array['Khương Đình']),
  ('Phường Phương Liệt', 'phuong', array['Phương Liệt']),
  ('Phường Cầu Giấy', 'phuong', array['Cầu Giấy']),
  ('Phường Nghĩa Đô', 'phuong', array['Nghĩa Đô']),
  ('Phường Yên Hòa', 'phuong', array['Yên Hòa', 'Yên Hoà', 'Trung Kính', 'Khúc Thừa Dụ']),
  ('Phường Tây Hồ', 'phuong', array['Tây Hồ', 'Thuỵ Khuê', 'Trích Sài', 'Âu Cơ', 'Đường Bưởi']),
  ('Phường Phú Thượng', 'phuong', array['Phú Thượng']),
  ('Phường Tây Tựu', 'phuong', array['Tây Tựu']),
  ('Phường Phú Diễn', 'phuong', array['Phú Diễn']),
  ('Phường Xuân Đỉnh', 'phuong', array['Xuân Đỉnh']),
  ('Phường Đông Ngạc', 'phuong', array['Đông Ngạc']),
  ('Phường Thượng Cát', 'phuong', array['Thượng Cát']),
  ('Phường Từ Liêm', 'phuong', array['Từ Liêm']),
  ('Phường Xuân Phương', 'phuong', array['Xuân Phương']),
  ('Phường Tây Mỗ', 'phuong', array['Tây Mỗ']),
  ('Phường Đại Mỗ', 'phuong', array['Đại Mỗ']),
  ('Phường Long Biên', 'phuong', array['Long Biên']),
  ('Phường Bồ Đề', 'phuong', array['Bồ Đề']),
  ('Phường Việt Hưng', 'phuong', array['Việt Hưng']),
  ('Phường Phúc Lợi', 'phuong', array['Phúc Lợi']),
  ('Phường Hà Đông', 'phuong', array['Hà Đông']),
  ('Phường Dương Nội', 'phuong', array['Dương Nội']),
  ('Phường Yên Nghĩa', 'phuong', array['Yên Nghĩa']),
  ('Phường Phú Lương', 'phuong', array['Phú Lương']),
  ('Phường Kiến Hưng', 'phuong', array['Kiến Hưng']),
  ('Phường Thanh Liệt', 'phuong', array['Thanh Liệt']),
  ('Phường Chương Mỹ', 'phuong', array['Chương Mỹ']),
  ('Phường Sơn Tây', 'phuong', array['Sơn Tây']),
  ('Phường Tùng Thiện', 'phuong', array['Tùng Thiện']),
  ('Xã Thanh Trì', 'xa', array['Thanh Trì']),
  ('Xã Đại Thanh', 'xa', array['Đại Thanh']),
  ('Xã Nam Phù', 'xa', array['Nam Phù']),
  ('Xã Ngọc Hồi', 'xa', array['Ngọc Hồi']),
  ('Xã Thượng Phúc', 'xa', array['Thượng Phúc']),
  ('Xã Thường Tín', 'xa', array['Thường Tín']),
  ('Xã Chương Dương', 'xa', array['Chương Dương']),
  ('Xã Hồng Vân', 'xa', array['Hồng Vân']),
  ('Xã Phú Xuyên', 'xa', array['Phú Xuyên']),
  ('Xã Phượng Dực', 'xa', array['Phượng Dực']),
  ('Xã Chuyên Mỹ', 'xa', array['Chuyên Mỹ']),
  ('Xã Đại Xuyên', 'xa', array['Đại Xuyên']),
  ('Xã Thanh Oai', 'xa', array['Thanh Oai']),
  ('Xã Bình Minh', 'xa', array['Bình Minh']),
  ('Xã Tam Hưng', 'xa', array['Tam Hưng']),
  ('Xã Dân Hòa', 'xa', array['Dân Hòa']),
  ('Xã Vân Đình', 'xa', array['Vân Đình']),
  ('Xã Ứng Thiên', 'xa', array['Ứng Thiên']),
  ('Xã Hòa Xá', 'xa', array['Hòa Xá']),
  ('Xã Ứng Hòa', 'xa', array['Ứng Hòa']),
  ('Xã Mỹ Đức', 'xa', array['Mỹ Đức']),
  ('Xã Hồng Sơn', 'xa', array['Hồng Sơn']),
  ('Xã Phúc Sơn', 'xa', array['Phúc Sơn']),
  ('Xã Hương Sơn', 'xa', array['Hương Sơn']),
  ('Xã Phú Nghĩa', 'xa', array['Phú Nghĩa']),
  ('Xã Xuân Mai', 'xa', array['Xuân Mai']),
  ('Xã Trần Phú', 'xa', array['Trần Phú']),
  ('Xã Hòa Phú', 'xa', array['Hòa Phú']),
  ('Xã Quảng Bị', 'xa', array['Quảng Bị']),
  ('Xã Minh Châu', 'xa', array['Minh Châu']),
  ('Xã Quảng Oai', 'xa', array['Quảng Oai']),
  ('Xã Vật Lại', 'xa', array['Vật Lại']),
  ('Xã Cổ Đô', 'xa', array['Cổ Đô']),
  ('Xã Bất Bạt', 'xa', array['Bất Bạt']),
  ('Xã Suối Hai', 'xa', array['Suối Hai']),
  ('Xã Ba Vì', 'xa', array['Ba Vì']),
  ('Xã Yên Bài', 'xa', array['Yên Bài']),
  ('Xã Đoài Phương', 'xa', array['Đoài Phương']),
  ('Xã Phúc Thọ', 'xa', array['Phúc Thọ']),
  ('Xã Phúc Lộc', 'xa', array['Phúc Lộc']),
  ('Xã Hát Môn', 'xa', array['Hát Môn']),
  ('Xã Thạch Thất', 'xa', array['Thạch Thất']),
  ('Xã Hạ Bằng', 'xa', array['Hạ Bằng']),
  ('Xã Tây Phương', 'xa', array['Tây Phương']),
  ('Xã Hòa Lạc', 'xa', array['Hòa Lạc']),
  ('Xã Yên Xuân', 'xa', array['Yên Xuân']),
  ('Xã Quốc Oai', 'xa', array['Quốc Oai']),
  ('Xã Hưng Đạo', 'xa', array['Hưng Đạo']),
  ('Xã Kiều Phú', 'xa', array['Kiều Phú']),
  ('Xã Phú Cát', 'xa', array['Phú Cát']),
  ('Xã Hoài Đức', 'xa', array['Hoài Đức']),
  ('Xã Dương Hòa', 'xa', array['Dương Hòa']),
  ('Xã Sơn Đồng', 'xa', array['Sơn Đồng']),
  ('Xã An Khánh', 'xa', array['An Khánh']),
  ('Xã Đan Phượng', 'xa', array['Đan Phượng']),
  ('Xã Ô Diên', 'xa', array['Ô Diên']),
  ('Xã Liên Minh', 'xa', array['Liên Minh']),
  ('Xã Gia Lâm', 'xa', array['Gia Lâm']),
  ('Xã Thuận An', 'xa', array['Thuận An']),
  ('Xã Bát Tràng', 'xa', array['Bát Tràng']),
  ('Xã Phù Đổng', 'xa', array['Phù Đổng']),
  ('Xã Thư Lâm', 'xa', array['Thư Lâm']),
  ('Xã Đông Anh', 'xa', array['Đông Anh']),
  ('Xã Phúc Thịnh', 'xa', array['Phúc Thịnh']),
  ('Xã Thiên Lộc', 'xa', array['Thiên Lộc']),
  ('Xã Vĩnh Thanh', 'xa', array['Vĩnh Thanh']),
  ('Xã Mê Linh', 'xa', array['Mê Linh']),
  ('Xã Yên Lãng', 'xa', array['Yên Lãng']),
  ('Xã Tiến Thắng', 'xa', array['Tiến Thắng']),
  ('Xã Quang Minh', 'xa', array['Quang Minh']),
  ('Xã Sóc Sơn', 'xa', array['Sóc Sơn']),
  ('Xã Đa Phúc', 'xa', array['Đa Phúc']),
  ('Xã Nội Bài', 'xa', array['Nội Bài']),
  ('Xã Trung Giã', 'xa', array['Trung Giã']),
  ('Xã Kim Anh', 'xa', array['Kim Anh'])
on conflict (name) do update set
  type = excluded.type,
  old_names = excluded.old_names;

comment on table public.admin_wards is '126 Hanoi commune-level units (51 phuong and 75 xa), effective 2025-07-01.';
comment on table public.review_queue is 'v3 data-quality review queue.';
