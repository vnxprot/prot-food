"use client";
import type { Collection } from "@/lib/types";

export function CollectionPicker({ collections, selectedIds, onChange, isAdmin, onImport }: {
  collections: Collection[]; selectedIds: string[]; onChange: (ids: string[]) => void; isAdmin: boolean; onImport: () => void;
}) {
  const allSelected = collections.length > 0 && selectedIds.length === collections.length;
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  return <div className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="Chọn nguồn dữ liệu">
    <button type="button" onClick={() => onChange(collections.map((item) => item.id))} className={`shrink-0 rounded-full px-3 py-2 text-xs font-extrabold ${allSelected ? "bg-[#402c1e] text-[#fbf3ea]" : "bg-[#402c1e]/8"}`}>Tất cả</button>
    {collections.map((collection) => <button key={collection.id} type="button" onClick={() => toggle(collection.id)} onDoubleClick={() => onChange([collection.id])} title="Bấm đúp để chỉ xem nguồn này" className={`shrink-0 rounded-full px-3 py-2 text-xs font-extrabold transition ${selectedIds.includes(collection.id) ? "bg-[#a35e2d] text-white" : "bg-[#402c1e]/8"}`}>{selectedIds.includes(collection.id) ? "✓ " : ""}{collection.icon} {collection.name}</button>)}
    {isAdmin && <button type="button" onClick={onImport} className="shrink-0 rounded-full border border-dashed border-[#a35e2d]/60 px-3 py-2 text-xs font-extrabold text-[#a35e2d]">＋ Thêm nguồn</button>}
  </div>;
}
