"use client";

import { Dices, MapPin, Navigation, RotateCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Restaurant } from "@/lib/types";
import { directionsUrl, formatDistance, haversineKm, type TravelMode } from "@/lib/utils";
import { CategoryBadge } from "./category-badge";

type Position = { lat: number; lng: number } | null;

const hasAny = (category: string | null, words: string[]) =>
  words.some((word) => (category || "").toLocaleLowerCase("vi").includes(word));

function mealMoment(hour = new Date().getHours()) {
  if (hour >= 6 && hour <= 10) return { label: "Bữa sáng", words: ["phở", "bún", "bánh cuốn", "xôi", "cà phê", "cafe"] };
  if (hour >= 11 && hour <= 13) return { label: "Bữa trưa", words: ["cơm", "bún chả", "bún đậu", "mỳ", "mi", "phở"] };
  if (hour >= 17 && hour <= 21) return { label: "Bữa tối", words: ["lẩu", "lau", "nướng", "nuong", "nhậu", "nhau", "hải sản", "hai san", "ốc"] };
  return { label: hour > 21 || hour < 6 ? "Ăn đêm" : "Bữa xế", words: ["cháo", "chao", "ăn vặt", "an vat", "bánh", "bún", "phở"] };
}

export function FoodRoulette({
  restaurants,
  position,
  travelMode,
  onOpen,
}: {
  restaurants: Restaurant[];
  position: Position;
  travelMode: TravelMode;
  onOpen: (restaurant: Restaurant) => void;
}) {
  const [result, setResult] = useState<Restaurant | null>(null);
  const [spinning, setSpinning] = useState(false);
  const deckRef = useRef<string[]>([]);
  const moment = useMemo(() => mealMoment(), []);
  const candidates = useMemo(() => {
    const openRestaurants = restaurants.filter((item) => item.location_verification !== "closed");
    const withinRange = openRestaurants.filter((item) => {
      if (!position || item.lat == null || item.lng == null) return true;
      return haversineKm(position.lat, position.lng, item.lat, item.lng) <= 3;
    });
    const timeMatches = withinRange.filter((item) => hasAny(item.category, moment.words));
    return (timeMatches.length ? timeMatches : withinRange.length ? withinRange : openRestaurants).filter((item) => item.taste_rating !== "khong_ngon");
  }, [restaurants, position, moment.words]);
  const candidateKey = useMemo(() => candidates.map((item) => item.id).sort().join(","), [candidates]);
  const distance = result && position && result.lat != null && result.lng != null
    ? haversineKm(position.lat, position.lng, result.lat, result.lng)
    : null;
  useEffect(() => {
    deckRef.current = [];
    setResult(null);
  }, [candidateKey]);
  const pick = () => {
    if (!candidates.length || spinning) return;
    setSpinning(true);
    window.setTimeout(() => {
      // The deck deliberately contains every eligible restaurant. The old
      // implementation kept selecting only the unchanged "untried" subset.
      const bucket = candidates;
      const bucketIds = bucket.map((item) => item.id);
      const available = deckRef.current.filter((id) => bucketIds.includes(id));
      if (!available.length) {
        // Fisher–Yates deck: every candidate appears exactly once before the
        // next cycle starts, so repeated rolls cannot get stuck on a few items.
        deckRef.current = [...bucketIds];
        for (let index = deckRef.current.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [deckRef.current[index], deckRef.current[swapIndex]] = [deckRef.current[swapIndex], deckRef.current[index]];
        }
      }
      const nextId = deckRef.current.pop();
      const next = bucket.find((item) => item.id === nextId) || bucket[0];
      setResult(next);
      navigator.vibrate?.(15);
      setSpinning(false);
    }, 650);
  };
  return (
    <div className="space-y-4">
      <section className="roulette-panel overflow-hidden rounded-[28px] p-5 text-[#fbf3ea] shadow-xl shadow-[#402c1e]/20">
        <div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-1 text-xs font-extrabold tracking-wider text-[#f6d3aa]"><Sparkles size={14} /> SMART FOOD ROULETTE</p><h2 className="mt-2 text-3xl font-extrabold">{moment.label},<br />ăn gì đây Prot?</h2><p className="mt-2 max-w-sm text-sm text-[#f7eadc]/80">Ưu tiên món hợp khung giờ {position ? "và quán trong bán kính 3km" : "; bật GPS để lọc theo khoảng cách"}.</p></div><span className={`flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 text-3xl ${spinning ? "animate-spin" : ""}`}>🎲</span></div>
        <button type="button" onClick={pick} disabled={!candidates.length || spinning} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e5a36a] py-3.5 text-sm font-extrabold text-[#402c1e] transition hover:brightness-105 active:scale-[.98] disabled:opacity-60"><Dices size={18} />{spinning ? "Đang bốc thẻ…" : "Gợi ý cho Prot ngay!"}</button>
        <p className="mt-3 text-center text-xs text-[#f7eadc]/70">{candidates.length} quán đang có thể được gợi ý</p>
      </section>
      {result ? <section className="glass animate-rise overflow-hidden rounded-[26px] p-5"><p className="text-[11px] font-extrabold tracking-wider text-[#a35e2d]">LÁ BÀI HÔM NAY</p><h3 className="mt-1 text-2xl font-extrabold">{result.name}</h3><div className="mt-3 flex flex-wrap gap-2"><CategoryBadge category={result.category} />{distance != null && <span className="inline-flex items-center gap-1 rounded-full bg-[#402c1e]/7 px-2.5 py-1 text-[11px] font-bold"><MapPin size={12} />{formatDistance(distance)} đường thẳng</span>}</div>{result.address_raw && <p className="mt-4 text-sm leading-relaxed text-[#6b5644] dark:text-[#cbb4a0]">{result.address_raw}</p>}<div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => onOpen(result)} className="rounded-xl bg-[#402c1e]/8 px-3 py-3 text-sm font-bold">Xem quán</button><a href={directionsUrl(result, travelMode)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-[#402c1e] px-3 py-3 text-sm font-extrabold text-[#fbf3ea]"><Navigation size={15} />Chỉ đường</a></div><button type="button" onClick={pick} className="mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-sm font-bold text-[#a35e2d]"><RotateCw size={15} />Quay lại cái khác</button></section> : <section className="glass rounded-[22px] px-5 py-10 text-center"><span className="text-4xl">🍽️</span><p className="mt-3 text-sm text-[#8a7360]">Bấm nút để Prot nhận một gợi ý ngẫu nhiên.</p></section>}
    </div>
  );
}
