"use client";

import { Clock3, MapPin, Utensils } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { categoryIcon } from "./category-badge";

const latestVisit = (restaurant: Restaurant) => restaurant.last_visited_at || restaurant.created_at.slice(0, 10);
const isOlderThan90Days = (date: string) => Date.now() - new Date(`${date}T00:00:00`).getTime() > 90 * 86_400_000;

export function FoodFootprint({ restaurants, onOpen }: { restaurants: Restaurant[]; onOpen: (restaurant: Restaurant) => void }) {
  const visited = restaurants.filter((item) => item.status === "da_den");
  const categoryCounts = Array.from(
    visited.reduce((map, item) => map.set(item.category || "Khác", (map.get(item.category || "Khác") || 0) + 1), new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const wardCounts = Array.from(
    restaurants.reduce((map, item) => {
      const ward = item.admin_wards?.name;
      if (ward) map.set(ward, (map.get(ward) || 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const staleRestaurants = restaurants
    .filter((item) => item.taste_rating === "ngon" && item.last_visited_at && isOlderThan90Days(item.last_visited_at))
    .sort((a, b) => latestVisit(a).localeCompare(latestVisit(b)))
    .slice(0, 5);
  const maxCategory = categoryCounts[0]?.[1] || 1;
  const maxWard = wardCounts[0]?.[1] || 1;

  return (
    <div className="space-y-4">
      <section className="glass rounded-[22px] p-4">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-[#e5a36a]/25 p-2.5 text-[#70421f]"><Utensils size={18} /></span>
          <div><p className="font-extrabold">Khẩu vị của Prot</p><p className="mt-0.5 text-xs text-[#8a7360]">Tỷ trọng theo những quán đã ghé</p></div>
        </div>
        <div className="mt-4 space-y-3">
          {categoryCounts.length ? categoryCounts.map(([category, count]) => (
            <div key={category}>
              <div className="flex items-center justify-between text-sm"><span className="font-bold">{categoryIcon(category)} {category}</span><span className="text-xs text-[#8a7360]">{count} quán</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#402c1e]/8"><div className="h-full rounded-full bg-gradient-to-r from-[#a35e2d] to-[#e5a36a]" style={{ width: `${(count / maxCategory) * 100}%` }} /></div>
            </div>
          )) : <p className="py-4 text-sm text-[#8a7360]">Check-in vài quán để bắt đầu vẽ khẩu vị của bạn.</p>}
        </div>
      </section>

      <section className="glass rounded-[22px] p-4">
        <div className="flex items-start gap-3"><span className="rounded-2xl bg-[#a35e2d]/12 p-2.5 text-[#a35e2d]"><MapPin size={18} /></span><div><p className="font-extrabold">Dấu chân ẩm thực</p><p className="mt-0.5 text-xs text-[#8a7360]">Khu vực có nhiều quán nhất trong 126 xã / phường</p></div></div>
        <div className="mt-4 space-y-3">
          {wardCounts.length ? wardCounts.map(([ward, count]) => (
            <div key={ward}><div className="flex items-center justify-between text-sm"><span className="font-bold">{ward}</span><span className="text-xs text-[#8a7360]">{count} quán</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#402c1e]/8"><div className="h-full rounded-full bg-[#402c1e] dark:bg-[#e5a36a]" style={{ width: `${(count / maxWard) * 100}%` }} /></div></div>
          )) : <p className="py-4 text-sm text-[#8a7360]">Các quán có phường / xã sẽ hiện ở đây.</p>}
        </div>
      </section>

      <section className="glass rounded-[22px] p-4">
        <div className="flex items-start gap-3"><span className="rounded-2xl bg-[#402c1e]/8 p-2.5 text-[#402c1e] dark:text-[#f7eadc]"><Clock3 size={18} /></span><div><p className="font-extrabold">Lâu rồi chưa ghé</p><p className="mt-0.5 text-xs text-[#8a7360]">Quán ngon hơn 90 ngày chưa quay lại</p></div></div>
        <div className="mt-4 divide-y divide-[#402c1e]/8">
          {staleRestaurants.length ? staleRestaurants.map((restaurant) => <button type="button" key={restaurant.id} onClick={() => onOpen(restaurant)} className="flex w-full items-center justify-between py-3 text-left"><span className="font-bold">{categoryIcon(restaurant.category)} {restaurant.name}</span><span className="text-xs text-[#8a7360]">{restaurant.last_visited_at}</span></button>) : <p className="py-4 text-sm text-[#8a7360]">Chưa có quán ngon nào cần nhắc lại.</p>}
        </div>
      </section>
    </div>
  );
}
