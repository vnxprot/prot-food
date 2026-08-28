-- Temporary minimal seed for wards/areas represented by the 41 imported addresses.
-- TODO: replace/expand this list with all 126 Hanoi commune-level units effective 2025-07-01.
insert into public.admin_wards (name, type, old_names) values
  ('Phường Ba Đình', 'phuong', array['Ba Đình', 'Quán Thánh', 'Đội Cấn', 'Ngọc Hà', 'Trúc Bạch', 'Hoè Nhai', 'Văn Cao', 'Quần Ngựa']),
  ('Phường Hoàn Kiếm', 'phuong', array['Hoàn Kiếm', 'Hàng Chai', 'Hàng Chiếu', 'Hàng Giấy', 'Lãn Ông', 'Phùng Hưng', 'Phúc Tân']),
  ('Phường Ô Chợ Dừa', 'phuong', array['Ô Chợ Dừa', 'Hoàng Cầu', 'Hào Nam', 'Thái Thịnh']),
  ('Phường Văn Miếu - Quốc Tử Giám', 'phuong', array['Văn Miếu', 'Điện Biên Phủ']),
  ('Phường Kim Liên', 'phuong', array['Đông Tác', 'Khương Thượng']),
  ('Phường Giảng Võ', 'phuong', array['Ngọc Khánh', 'Vạn Phúc']),
  ('Phường Tây Hồ', 'phuong', array['Thuỵ Khuê', 'Trích Sài', 'Âu Cơ', 'Đường Bưởi']),
  ('Phường Yên Hòa', 'phuong', array['Yên Hoà', 'Trung Kính', 'Khúc Thừa Dụ']),
  ('Phường Hai Bà Trưng', 'phuong', array['Hai Bà Trưng', 'Phố Huế', 'Bạch Mai', 'Hoà Mã', 'Thái Phiên']),
  ('Phường Đống Đa', 'phuong', array['Đống Đa', 'Nguyễn Thượng Hiền'])
on conflict (name) do update set old_names = excluded.old_names;
