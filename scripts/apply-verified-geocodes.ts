import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type VerifiedPlace = { name: string; address: string; lat: number; lng: number };

// Points decoded from Google Maps Plus Codes after manually matching each POI
// against the seed name and/or its exact street address on 2026-08-28.
const verified: VerifiedPlace[] = [
  { name: "Mỳ vằn thắn", address: "103A5 Vạn Phúc, Ba Đình", lat: 21.0336875, lng: 105.8155625 },
  { name: "Lẩu Bò Cường Nga", address: "27B Văn Miếu", lat: 21.0290625, lng: 105.8366875 },
  { name: "Bún ốc cô Thêm", address: "6 Hàng Chai", lat: 21.0374375, lng: 105.8476875 },
  { name: "Bánh rán cổ truyền HK", address: "102E2 Thái Thịnh", lat: 21.0114375, lng: 105.8178125 },
  { name: "Lẩu tôm bầu", address: "30 ngõ 4 Quần Ngựa", lat: 21.0418125, lng: 105.8154375 },
  { name: "Bách hợp quán", address: "281 Yên Hoà", lat: 21.0216875, lng: 105.7914375 },
  { name: "Dê ngon quán", address: "437 Âu Cơ", lat: 21.0776875, lng: 105.8203125 },
  { name: "Bánh xèo nem lụi", address: "55 Hai Bà Trưng", lat: 21.0265625, lng: 105.8443125 },
  { name: "King sushi", address: "6 Khúc Thừa Dụ", lat: 21.0348125, lng: 105.7930625 },
  { name: "Phở trộn Hạnh", address: "65B Lãn Ông", lat: 21.0353125, lng: 105.8484375 },
  { name: "Chân gà luộc, mì trộn, óc trần", address: "277 Phúc Tân", lat: 21.0341875, lng: 105.8564375 },
  { name: "Quán bia Góc Anh Em", address: "105E1 ngõ 120 Thái Thịnh", lat: 21.0115625, lng: 105.8176875 },
  { name: "Bún chả Ngọc Xuân", address: "102 Thuỵ Khuê", lat: 21.0419375, lng: 105.8258125 },
  { name: "Cháo Ếch", address: "255 Phố Huế", lat: 21.0115625, lng: 105.8518125 },
  { name: "Vịt cỏ Tiến béo", address: "210 Hào Nam", lat: 21.0269375, lng: 105.8280625 },
  { name: "Bò nhúng dấm", address: "2A Thái Phiên", lat: 21.0104375, lng: 105.8514375 },
  { name: "Vịt", address: "Kiot 15 Trần Quang Diệu", lat: 21.0138125, lng: 105.8229375 },
  { name: "Bún riêu cô Lúa", address: "40 ngõ 28 Hương Viên", lat: 21.0116625, lng: 105.8550156 },
  { name: "Bún bung cô Ban", address: "Khương Thượng", lat: 21.0045125, lng: 105.8315469 },
  { name: "Bún thang", address: "54 Hàng Chiếu", lat: 21.0371875, lng: 105.8508125 },
  { name: "Bún dọc mùng cô Luyến", address: "199 Đội Cấn", lat: 21.0351875, lng: 105.8229375 },
  { name: "Bún mọc", address: "22 Điện Biên Phủ", lat: 21.0300625, lng: 105.8420625 },
  { name: "Phở gà", address: "71 Văn Cao", lat: 21.0399375, lng: 105.8161875 },
  { name: "Hủ tiếu Phát", address: "568 Đường Bưởi", lat: 21.0454375, lng: 105.8064375 },
  { name: "Linh tít phở bò", address: "51 ngõ 209 Đội Cấn", lat: 21.0368125, lng: 105.8229375 },
  { name: "Phở ngọc", address: "115C Phùng Hưng", lat: 21.0349375, lng: 105.8459375 },
  { name: "Vó bò (nhậu)", address: "96 Hoà Mã", lat: 21.0153125, lng: 105.8525625 },
  { name: "Bánh mỳ Thuỷ", address: "76 Hàng Giấy", lat: 21.0383125, lng: 105.8485625 },
  { name: "Bún hải sản Hương Lan", address: "48 Trung Kính", lat: 21.0139375, lng: 105.7975625 },
];

function readEnv(name: string) {
  const source = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
  return source.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim();
}

async function main() {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Missing Supabase values in .env.local");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  let changed = 0;
  for (const place of verified) {
    const { data, error } = await supabase.from("restaurants")
      .update({ lat: place.lat, lng: place.lng, geocode_source: "manual", geocode_confidence: "manual" })
      .eq("name", place.name).eq("address_raw", place.address).select("id");
    if (error) throw error;
    changed += data.length;
    console.log(`${place.name}: ${data.length} record(s)`);
  }
  if (changed !== 30) throw new Error(`Expected 30 updated records (including duplicate), got ${changed}.`);
  console.log(`Verified locations saved: ${changed}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
