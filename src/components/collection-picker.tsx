"use client";
import { Pencil, Trash2 } from "lucide-react";
import type { Collection } from "@/lib/types";

export function CollectionPicker({ collections, selectedIds, onChange, isAdmin, onImport, onEdit, onDelete }: {
  collections: Collection[]; selectedIds: string[]; onChange: (ids: string[]) => void; isAdmin: boolean; onImport: () => void; onEdit: (collection: Collection) => void; onDelete: (collection: Collection) => void;
}) {
  const allSelected = collections.length > 0 && selectedIds.length === collections.length;
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  return <div className="mb-5 space-y-2" aria-label="Danh sách nguồn dữ liệu">
    <button type="button" onClick={() => onChange(collections.map((item) => item.id))} className={`mb-2 w-full rounded-xl px-3 py-2 text-left text-xs font-extrabold ${allSelected ? "bg-[#402c1e] text-[#fbf3ea]" : "bg-[#402c1e]/8"}`}>✓ Tất cả nguồn <span className="float-right font-normal opacity-70">{allSelected ? "Đang bật" : "Bật tất cả"}</span></button>
    {collections.map((collection) => { const enabled = selectedIds.includes(collection.id); return <div key={collection.id} className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 transition ${enabled ? "border-[#a35e2d]/35 bg-[#a35e2d]/8" : "border-[#402c1e]/10 bg-white/30 opacity-70 dark:bg-black/10"}`}><button type="button" onDoubleClick={() => onChange([collection.id])} title="Bấm đúp để chỉ xem nguồn này" className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-extrabold">{collection.icon} {collection.name}</span><span className="mt-0.5 block text-[11px] text-[#8a7360]">{collection.owner_name} · {collection.type === "cafe" ? "Cafe" : "Đồ ăn"}</span></button>{isAdmin && !collection.is_default && <span className="flex shrink-0 gap-1"><button type="button" aria-label={`Sửa ${collection.name}`} title="Sửa nguồn" onClick={() => onEdit(collection)} className="rounded-lg p-2 text-[#70421f] hover:bg-[#a35e2d]/12"><Pencil size={14}/></button><button type="button" aria-label={`Xóa ${collection.name}`} title="Xóa nguồn" onClick={() => onDelete(collection)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-500/10"><Trash2 size={14}/></button></span>}<button type="button" aria-label={`${enabled ? "Tắt" : "Bật"} ${collection.name}`} aria-pressed={enabled} onClick={() => toggle(collection.id)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? "bg-[#a35e2d]" : "bg-[#402c1e]/20"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? "left-6" : "left-1"}`} /></button></div>; })}
    {isAdmin && <button type="button" onClick={onImport} className="w-full rounded-xl border border-dashed border-[#a35e2d]/60 px-3 py-3 text-left text-xs font-extrabold text-[#a35e2d]">＋ Thêm nguồn dữ liệu</button>}
  </div>;
}
