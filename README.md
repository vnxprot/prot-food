# Prot Food

PWA cá nhân để quản lý quán ăn/uống ở Hà Nội. Stack: Next.js 14 App Router, TypeScript, Tailwind, Supabase, Nominatim và Vercel.

## Chạy local

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Điền hai biến Supabase vào `.env.local`. File này đã bị Git bỏ qua.

## Cơ sở dữ liệu

Schema và dữ liệu phường/xã tối thiểu nằm ở `supabase/migrations`. Áp dụng bằng Supabase CLI sau khi link project:

```bash
supabase db push
```

Seed hiện bao gồm các phường/địa danh xuất hiện trong 41 quán, với TODO mở rộng đầy đủ 126 đơn vị cấp xã Hà Nội theo thay đổi 01/07/2025.

## Import và geocode seed

`docs/seed_quan_an.json` là bản sao dữ liệu đầu vào. Lệnh dưới đây lần lượt geocode qua Nominatim với User-Agent rõ ràng và chờ 1.1 giây giữa các request:

```bash
npm run geocode:seed
```

Script dùng `SUPABASE_SERVICE_ROLE_KEY` nếu có, nếu không dùng `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Mỗi kết quả Nominatim được đánh dấu confidence `low` để review lại trong app. Không có map SDK hoặc API Google Maps trong project; nút chỉ đường chỉ mở Google Maps qua URL.
