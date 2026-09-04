"use client";

export type QuickContext = "all" | "nearest" | "favorite" | "untried" | "stale";

const options: Array<{ id: QuickContext; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "nearest", label: "⚡ Gần nhất" },
  { id: "favorite", label: "⭐ Quán ruột" },
  { id: "untried", label: "🎯 Chưa thử" },
  { id: "stale", label: "⏳ Lâu chưa ghé" },
];

export function QuickContextFilter({
  value,
  onChange,
}: {
  value: QuickContext;
  onChange: (value: QuickContext) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Lọc nhanh theo ngữ cảnh">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-bold transition active:scale-95 ${
            value === option.id
              ? "bg-[#402c1e] text-[#fbf3ea] shadow-md"
              : "bg-[#402c1e]/7 text-[#402c1e] dark:bg-[#f7eadc]/10 dark:text-[#f7eadc]"
          }`}
        >
          {option.label}
          {option.id === "nearest" && <span className="ml-1 text-[10px] opacity-80">&lt;1.5km</span>}
        </button>
      ))}
    </div>
  );
}
