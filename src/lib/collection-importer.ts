import * as XLSX from "xlsx";
import { decodePlusCode, extractPlusCode } from "./plus-codes";
import { supabase } from "./supabase";

export type ImportMapping = Partial<Record<"name" | "address" | "category" | "notes" | "coordinates", string>>;
export type ImportRow = Record<string, unknown>;

const dictionary: Record<keyof ImportMapping, string[]> = {
  name: ["ten", "ten quan", "name", "quan", "dia diem", "tieu de"],
  address: ["dia chi", "address", "duong", "pho", "vi tri", "dia ban"],
  category: ["loai", "danh muc", "mon", "category", "nhom mon", "type"],
  notes: ["ghi chu", "note", "notes", "mo ta", "danh gia", "review", "mon ngon"],
  coordinates: ["toa do", "coordinates", "coords", "plus code", "link maps", "url", "ma"],
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

export async function processImportRows(rows: ImportRow[], collectionId: string, mapping: ImportMapping, onProgress?: (done: number, total: number) => void) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const payload: Record<string, unknown>[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const name = value(row, mapping.name);
    if (!name) { onProgress?.(index + 1, rows.length); continue; }
    const address = value(row, mapping.address);
    const point = coordinates(`${value(row, mapping.coordinates)} ${address}`);
    payload.push({
      name, address_raw: address || null, category: value(row, mapping.category) || null,
      notes: value(row, mapping.notes) || null, collection_id: collectionId,
      status: "muon_den", geocode_source: point?.source || "unset",
      geocode_confidence: point ? "high" : "low", lat: point?.lat ?? null, lng: point?.lng ?? null,
      location_verification: "unverified",
    });
    onProgress?.(index + 1, rows.length);
  }
  if (!payload.length) return 0;
  const { error } = await supabase.from("restaurants").insert(payload);
  if (error) throw new Error(error.message);
  return payload.length;
}
