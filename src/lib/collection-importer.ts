import * as XLSX from "xlsx";
import { decodePlusCode, extractPlusCode } from "./plus-codes";

export type ImportMapping = Partial<Record<"name" | "address" | "category" | "notes" | "coordinates" | "latitude" | "longitude" | "ward", string>>;
export type ImportRow = Record<string, unknown>;

const dictionary: Record<keyof ImportMapping, string[]> = {
  name: ["ten", "ten quan", "name", "quan", "dia diem", "tieu de"],
  address: ["dia chi", "address", "duong", "pho", "vi tri", "dia ban"],
  category: ["loai", "danh muc", "mon", "category", "nhom mon", "type"],
  notes: ["ghi chu", "note", "notes", "mo ta", "danh gia", "review", "mon ngon"],
  coordinates: ["toa do", "coordinates", "coords", "plus code", "link maps", "url", "ma"],
  latitude: ["latitude", "lat", "vi do"],
  longitude: ["longitude", "lng", "lon", "kinh do"],
  ward: ["phuong xa hien hanh", "phuong xa", "phuong", "ward", "commune", "xa"],
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();

export function autoMapColumns(headers: string[]): ImportMapping {
  return Object.fromEntries(Object.entries(dictionary).map(([field, candidates]) => [field, headers.find((header) => {
    const normalized = normalize(header);
    return candidates.some((candidate) => normalized === candidate || normalized.includes(candidate));
  })])) as ImportMapping;
}

export async function parseImportFile(file: File): Promise<ImportRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return sheet ? XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: "" }) : [];
}

export function parseCsvText(csv: string): ImportRow[] {
  const workbook = XLSX.read(csv, { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return sheet ? XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: "" }) : [];
}

function value(row: ImportRow, column?: string) { return column ? String(row[column] ?? "").trim() : ""; }
function coordinates(raw: string) {
  const match = raw.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(\d{2,3}(?:\.\d+)?)/);
  if (match) return { lat: Number(match[1]), lng: Number(match[2]), source: "manual" as const };
  const plusCode = extractPlusCode(raw);
  const decoded = plusCode ? decodePlusCode(plusCode) : null;
  return decoded ? { ...decoded, source: "plus_code" as const } : null;
}

function coordinatePair(latRaw: string, lngRaw: string) {
  if (!latRaw || !lngRaw) return null;
  const lat = Number(latRaw.replace(",", "."));
  const lng = Number(lngRaw.replace(",", "."));
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng, source: "manual" as const }
    : null;
}

export function buildImportPayload(rows: ImportRow[], collectionId: string, mapping: ImportMapping, onProgress?: (done: number, total: number) => void) {
  const payload: Record<string, unknown>[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const name = value(row, mapping.name);
    if (!name) { onProgress?.(index + 1, rows.length); continue; }
    const ward = value(row, mapping.ward);
    const addressBase = value(row, mapping.address);
    // Preserve the supplied administrative ward in the address so the UI can
    // resolve and display it consistently even though the import API stores
    // only address_raw (ward_id is assigned by the manual/geocode flow).
    const address = ward && !new RegExp(`(?:phường|phuong|xã|xa)\\s+${ward.replace(/^(phường|phuong|xã|xa)\\s+/i, "").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`, "i").test(addressBase)
      ? [addressBase, ward].filter(Boolean).join(", ")
      : addressBase;
    // Prefer explicit numeric columns. Legacy combined coordinates / Plus Code remains supported.
    // Never scan the address itself: numbers such as "Tầng 4, 20 Tràng Tiền" are not coordinates.
    const point = coordinatePair(value(row, mapping.latitude), value(row, mapping.longitude))
      || coordinates(value(row, mapping.coordinates));
    payload.push({
      name, address_raw: address || null, category: value(row, mapping.category) || null,
      notes: value(row, mapping.notes) || null, collection_id: collectionId,
      status: "muon_den", geocode_source: point?.source || "unset",
      geocode_confidence: point ? "manual" : "low", lat: point?.lat ?? null, lng: point?.lng ?? null,
      location_verification: point ? "verified" : "unverified",
    });
    onProgress?.(index + 1, rows.length);
  }
  return payload;
}
