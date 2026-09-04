"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function useModalBodyLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
      overscroll: body.style.overscrollBehavior,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      body.style.overscrollBehavior = previous.overscroll;
      window.scrollTo(0, scrollY);
    };
  }, [enabled]);
}

export type WardOption = { name: string; count: number };

export function SearchableWardModal({
  open,
  wards,
  value,
  onClose,
  onChange,
}: {
  open: boolean;
  wards: WardOption[];
  value: string;
  onClose: () => void;
  onChange: (ward: string) => void;
}) {
  useModalBodyLock(open);
  const [query, setQuery] = useState("");
  const visibleWards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return normalized
      ? wards.filter((ward) => ward.name.toLocaleLowerCase("vi").includes(normalized))
      : wards;
  }, [query, wards]);
  if (!open) return null;
  const choose = (next: string) => {
    onChange(next);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[60] flex max-w-[100vw] items-end overflow-hidden bg-[#140e0a]/45 p-0 backdrop-blur-sm md:items-center md:justify-center md:p-6">
      <section className="glass max-h-[92dvh] w-full max-w-lg overflow-hidden rounded-t-[28px] px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl dark:bg-[#281b13]/92 md:rounded-[28px] md:pb-5">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#402c1e]/20 dark:bg-white/20 md:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-extrabold tracking-wider text-[#a35e2d]">BỘ LỌC ĐỊA BÀN</p>
            <h2 className="text-xl font-extrabold">Chọn phường / xã</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-[#402c1e]/8 p-2" aria-label="Đóng">
            <X size={19} />
          </button>
        </div>
        <label className="flex items-center gap-2 rounded-2xl border border-[#402c1e]/10 bg-white/45 px-3 py-3 dark:border-white/10 dark:bg-black/10">
          <Search size={17} className="text-[#a35e2d]" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#8a7360]"
            placeholder="Gõ tên phường hoặc xã…"
          />
        </label>
        <button
          type="button"
          onClick={() => choose("all")}
          className={`mt-3 flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-bold ${value === "all" ? "bg-[#402c1e] text-[#fbf3ea]" : "bg-[#402c1e]/6"}`}
        >
          Tất cả địa bàn có quán
          <span className="text-xs opacity-75">{wards.reduce((sum, ward) => sum + ward.count, 0)} quán</span>
        </button>
        <div className="mt-2 max-h-[48dvh] min-w-0 divide-y divide-[#402c1e]/8 overflow-y-auto overscroll-contain">
          {visibleWards.map((ward) => (
            <button
              type="button"
              key={ward.name}
              onClick={() => choose(ward.name)}
              className={`flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold transition ${value === ward.name ? "bg-[#a35e2d]/12 text-[#7f421e]" : "hover:bg-[#402c1e]/5"}`}
            >
              {ward.name}
              <span className="rounded-full bg-[#402c1e]/8 px-2 py-0.5 text-xs tabular-nums dark:bg-white/10">{ward.count}</span>
            </button>
          ))}
          {!visibleWards.length && <p className="px-3 py-8 text-center text-sm text-[#8a7360]">Không có phường / xã phù hợp.</p>}
        </div>
      </section>
    </div>
  );
}
