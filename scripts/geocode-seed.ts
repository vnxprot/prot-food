import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type SeedItem = { id: number; name: string; shop_note: string | null; address_raw: string | null; visited: boolean; category: string; duplicate_of: number | null };
type Seed = { items: SeedItem[] };
type Ward = { id: string; name: string; old_names: string[] | null };
type ExistingRestaurant = { id: string; name: string; address_raw: string | null; is_duplicate_of: string | null };

const envPath = path.resolve(process.cwd(), ".env.local");
const fileEnv = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
      return match ? [[match[1], match[2]]] : [];
    }))
  : {};
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !KEY) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) first.");
const supabase = createClient(supabaseUrl, KEY, { auth: { persistSession: false } });
const seedPath = process.env.SEED_PATH || path.resolve(process.cwd(), "docs", "seed_quan_an.json");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function wardFor(address: string | null, wards: Ward[]) {
  if (!address) return null;
  const value = address.toLocaleLowerCase("vi");
  const match = wards.find((ward) => [ward.name, ...(ward.old_names || [])].some((name) => value.includes(name.toLocaleLowerCase("vi"))));
  return match?.id || null;
}

async function geocode(address: string) {
  const endpoint = new URL("https://nominatim.openstreetmap.org/search");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("limit", "1");
  endpoint.searchParams.set("countrycodes", "vn");
  endpoint.searchParams.set("q", `${address}, Hà Nội, Việt Nam`);
  const response = await fetch(endpoint, { headers: { "User-Agent": "Prot-Food-PWA/1.0 (vnxprot@gmail.com; personal seed import)", "Accept-Language": "vi" } });
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  const results = await response.json() as Array<{ lat: string; lon: string }>;
  return results[0] ? { lat: Number(results[0].lat), lng: Number(results[0].lon) } : null;
}

async function main() {
  const seed = JSON.parse(await fsPromises.readFile(seedPath, "utf8")) as Seed;
  const { data: wards, error: wardsError } = await supabase.from("admin_wards").select("id,name,old_names");
  if (wardsError) throw wardsError;
  const { data: existing, error: existingError } = await supabase.from("restaurants").select("id,name,address_raw,is_duplicate_of").order("created_at");
  if (existingError) throw existingError;
  const unusedExistingIds = new Set((existing as ExistingRestaurant[]).map((row) => row.id));
  const insertedBySeedId = new Map<number, string>();
  for (const item of seed.items) {
    let point: { lat: number; lng: number } | null = null;
    if (item.address_raw) {
      try { point = await geocode(item.address_raw); }
      catch (error) { console.warn(`Geocode failed for ${item.name}:`, error); }
      await sleep(1100); // Nominatim fair-use policy: at least one request per second.
    }
    const payload = {
      name: item.name, shop_note: item.shop_note, address_raw: item.address_raw,
      category: item.category, status: item.visited ? "da_den" : "muon_den",
      lat: point?.lat ?? null, lng: point?.lng ?? null,
      geocode_source: point ? "nominatim" : "unset", geocode_confidence: "low",
      ward_id: wardFor(item.address_raw, wards as Ward[]),
      is_duplicate_of: item.duplicate_of ? insertedBySeedId.get(item.duplicate_of) || null : null,
      notes: item.duplicate_of ? `Duplicate of seed item ${item.duplicate_of}.` : null,
    };
    const matches = (existing as ExistingRestaurant[]).filter((row) => unusedExistingIds.has(row.id) && row.name === item.name && row.address_raw === item.address_raw);
    const existingRow = item.duplicate_of
      ? matches.find((row) => row.is_duplicate_of !== null) || matches[0]
      : matches.find((row) => row.is_duplicate_of === null) || matches[0];
    if (existingRow) {
      const { error } = await supabase.from("restaurants").update(payload).eq("id", existingRow.id);
      if (error) throw error;
      unusedExistingIds.delete(existingRow.id);
      insertedBySeedId.set(item.id, existingRow.id);
    } else {
      const { data, error } = await supabase.from("restaurants").insert(payload).select("id").single();
      if (error) throw error;
      insertedBySeedId.set(item.id, data.id);
    }
    console.log(`[${item.id}/${seed.items.length}] ${item.name}: ${point ? "geocoded" : "no coordinates"}`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
