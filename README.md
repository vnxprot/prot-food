# Prot Food v3.1.0 — Smart Water Routing & Vietnamese Geocoding

PWA cá nhân để quản lý quán ăn/uống ở Hà Nội. Stack: Next.js 14 App Router, TypeScript, Tailwind, Supabase, Nominatim, OSRM Public và Vercel.

v3.0.0 thêm giao diện Neo-Glass 2.0, thanh điều hướng 5 mục với nút thêm quán ở giữa, check-in một chạm, Food Roulette theo khung giờ/GPS, bộ lọc ngữ cảnh, Smart Clipboard Importer, chọn phường/xã có tìm kiếm và Food Footprint.

v3.1.0 thêm bộ ước tính đường vòng qua hồ/sông Hà Nội chạy offline, giải mã Plus Code offline, fallback hai nhà cung cấp OSRM và cache stale-while-revalidate để danh sách khoảng cách không nhảy thứ tự.

## Chạy local

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Điền hai biến Supabase vào `.env.local`. File này đã bị Git bỏ qua.

## Cơ sở dữ liệu

Schema v3 và dữ liệu 126 phường/xã Hà Nội nằm ở `supabase/migrations`. Áp dụng bằng Supabase CLI sau khi link đúng project:

```bash
supabase db push
```

Migration `20260901000000_upgrade_v3_smart_neoglass.sql` chuẩn hóa schema cũ, seed đủ 51 phường + 75 xã và giữ tương thích với dữ liệu quán hiện có. Migration `20260904000000_upgrade_v3_1_geocoding.sql` bổ sung confidence `medium` và nguồn tọa độ `plus_code`.

## Import và geocode seed

`docs/seed_quan_an.json` là bản sao dữ liệu đầu vào. Lệnh dưới đây lần lượt geocode qua Nominatim với User-Agent rõ ràng và chờ 1.1 giây giữa các request:

```bash
npm run geocode:seed
```

Script dùng `SUPABASE_SERVICE_ROLE_KEY` nếu có, nếu không dùng `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Không có map SDK hoặc API Google Maps trả phí trong project; nút chỉ đường chỉ mở Google Maps qua URL.

## Kiểm thử v3.1

```bash
npm run test:v3.1
npm run build
```
