"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bike,
  CarFront,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Compass,
  Download,
  FileSpreadsheet,
  FileText,
  FileType2,
  Flame,
  List,
  Loader2,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRound,
  Utensils,
  X,
} from "lucide-react";
import { PwaRegister } from "@/components/pwa-register";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Restaurant, RestaurantDraft, Status } from "@/lib/types";
import {
  directionsUrl,
  formatDistance,
  haversineKm,
  statusLabel,
  type TravelMode,
} from "@/lib/utils";
import {
  downloadCsv,
  downloadExcel,
  downloadPdf,
  makeLocationReport,
} from "@/lib/report-export";

type Tab = "nearby" | "list" | "profile" | "report";
type FilterStatus = "all" | Status;
type Position = { lat: number; lng: number };
type RoadRoute = { distanceKm: number };
type RouteCache = {
  savedAt: number;
  routes: Record<string, RoadRoute>;
};

const ROUTE_CACHE_MS = 10 * 60 * 1_000;
const ROUTE_CANDIDATE_LIMIT = 12;

function routeCacheKey(position: Position) {
  // Around 110m in Hanoi: accurate enough to cache without needlessly sharing
  // a new precise GPS coordinate as the user takes a few steps.
  return `prot-food-route-v2:${position.lat.toFixed(3)}:${position.lng.toFixed(3)}`;
}

function isRouteEligible(restaurant: Restaurant) {
  return (
    restaurant.lat != null &&
    restaurant.lng != null &&
    restaurant.geocode_confidence !== "low" &&
    restaurant.location_verification !== "closed"
  );
}

const emptyDraft = (): RestaurantDraft => ({
  name: "",
  address_raw: "",
  notes: "",
  status: "muon_den",
  taste_rating: "",
  coordinates: "",
});
const toDraft = (restaurant: Restaurant): RestaurantDraft => ({
  name: restaurant.name,
  address_raw: restaurant.address_raw || "",
  notes: restaurant.notes || "",
  status: restaurant.status,
  taste_rating:
    restaurant.taste_rating === "ngon" ||
    restaurant.taste_rating === "khong_ngon"
      ? restaurant.taste_rating
      : "",
  coordinates:
    restaurant.lat != null && restaurant.lng != null
      ? `${restaurant.lat}, ${restaurant.lng}`
      : "",
});
const inputClass =
  "w-full rounded-xl border border-[#402c1e]/15 bg-white/60 px-3 py-2.5 text-[14px] text-[#402c1e] outline-none placeholder:text-[#8a7360] focus:border-[#a35e2d] dark:border-[#f7eadc]/15 dark:bg-[#1c130d]/40 dark:text-[#f7eadc]";

function StatusBadge({ status }: { status: Status }) {
  const done = status === "da_den";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${done ? "bg-[#a35e2d]/15 text-[#8e4f26] dark:text-[#efba8d]" : "bg-[#e5a36a]/25 text-[#70421f] dark:text-[#f1c496]"}`}
    >
      {done ? (
        <Check size={12} strokeWidth={3} />
      ) : (
        <Flame size={12} strokeWidth={2.5} />
      )}
      {statusLabel[status]}
    </span>
  );
}
function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition active:scale-95 ${active ? "bg-[#402c1e] text-[#fbf3ea] shadow-md" : "bg-[#402c1e]/7 text-[#402c1e] dark:bg-[#f7eadc]/10 dark:text-[#f7eadc]"}`}
    >
      {children}
    </button>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 mt-4 text-[11px] font-extrabold uppercase tracking-wider text-[#a35e2d]">
      {children}
    </p>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-bold text-[#402c1e] dark:text-[#f7eadc]">
        {label}
      </span>
      {children}
    </label>
  );
}
function TasteBadge({ taste }: { taste: Restaurant["taste_rating"] }) {
  if (taste === "ngon")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-800/10 px-2.5 py-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
        <ThumbsUp size={12} />
        Ngon
      </span>
    );
  if (taste === "khong_ngon")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-800/10 px-2.5 py-1 text-[11px] font-bold text-red-800 dark:text-red-300">
        <ThumbsDown size={12} />
        Không ngon
      </span>
    );
  return null;
}

function RestaurantCard({
  restaurant,
  airDistance,
  roadRoute,
  travelMode = "two-wheeler",
  onOpen,
}: {
  restaurant: Restaurant;
  airDistance?: number;
  roadRoute?: RoadRoute;
  travelMode?: TravelMode;
  onOpen: () => void;
}) {
  const ward = restaurant.admin_wards?.name;
  return (
    <article className="glass animate-rise mb-3 rounded-[22px] p-4 transition hover:-translate-y-0.5">
      <button
        onClick={onOpen}
        className="flex w-full items-start gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-bold leading-tight text-[#402c1e] dark:text-[#f7eadc]">
            {restaurant.name}
          </h2>
          {restaurant.address_raw && (
            <p className="mt-1 truncate text-[13px] text-[#6b5644] dark:text-[#cbb4a0]">
              {restaurant.address_raw}
              {ward && ` · ${ward}`}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={restaurant.status} />
            <TasteBadge taste={restaurant.taste_rating} />
            {restaurant.category && (
              <span className="rounded-full bg-[#402c1e]/7 px-2.5 py-1 text-[11px] font-semibold text-[#402c1e] dark:bg-[#f7eadc]/10 dark:text-[#f7eadc]">
                {restaurant.category}
              </span>
            )}
          </div>
        </div>
        {roadRoute ? (
          <div className="min-w-[72px] rounded-2xl bg-gradient-to-br from-[#a35e2d] to-[#e5a36a] px-2.5 py-2 text-center text-white shadow-sm">
            <span className="block text-[18px] font-extrabold leading-none">
              {formatDistance(roadRoute.distanceKm)}
            </span>
            <span className="mt-1 block text-[10px] font-bold leading-none opacity-90">
              đường bộ
            </span>
            {airDistance != null && (
              <span className="mt-1.5 block text-[9px] font-medium leading-none opacity-80">
                ↗ {formatDistance(airDistance)} thẳng
              </span>
            )}
          </div>
        ) : airDistance != null ? (
          <div className="min-w-[72px] rounded-2xl bg-[#402c1e]/7 px-2.5 py-2 text-center text-[#402c1e] dark:bg-[#f7eadc]/10 dark:text-[#f7eadc]">
            <span className="block text-[15px] font-extrabold leading-none">
              ↗ {formatDistance(airDistance)}
            </span>
            <span className="mt-1 block text-[10px] font-bold leading-none opacity-75">
              đường thẳng
            </span>
          </div>
        ) : (
          <ChevronRight size={18} className="mt-2 text-[#a35e2d]" />
        )}
      </button>
      <a
        href={directionsUrl(restaurant, travelMode)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-[#402c1e]/7 py-2 text-[12px] font-bold text-[#402c1e] transition hover:bg-[#402c1e]/10 dark:bg-[#f7eadc]/10 dark:text-[#f7eadc]"
      >
        <Navigation size={14} strokeWidth={2.5} />
        Chỉ đường Google Maps
      </a>
    </article>
  );
}

function similarRestaurants(
  draft: RestaurantDraft,
  restaurants: Restaurant[],
  excludedId?: string,
) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const name = normalize(draft.name);
  const address = normalize(draft.address_raw);
  if (name.length < 3) return [];
  return restaurants
    .filter(
      (item) =>
        item.id !== excludedId &&
        (normalize(item.name) === name ||
          ((normalize(item.name).includes(name) ||
            name.includes(normalize(item.name))) &&
            (!address ||
              normalize(item.address_raw || "").includes(address) ||
              address.includes(normalize(item.address_raw || ""))))),
    )
    .slice(0, 2);
}

function RestaurantForm({
  restaurant,
  restaurants,
  onClose,
  onSaved,
}: {
  restaurant: Restaurant | null;
  restaurants: Restaurant[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<RestaurantDraft>(
    restaurant ? toDraft(restaurant) : emptyDraft(),
  );
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidates = useMemo(
    () => similarRestaurants(draft, restaurants, restaurant?.id),
    [draft, restaurants, restaurant?.id],
  );
  const set = <K extends keyof RestaurantDraft>(
    key: K,
    value: RestaurantDraft[K],
  ) => setDraft((state) => ({ ...state, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase)
      return setError(
        "Chưa có kết nối Supabase. Hãy thêm biến môi trường trước khi lưu.",
      );
    if (!draft.name.trim()) return setError("Tên quán là mục bắt buộc.");
    const coordinates = draft.coordinates
      .trim()
      .match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    const payload = {
      name: draft.name.trim(),
      address_raw: draft.address_raw.trim() || null,
      notes: draft.notes.trim() || null,
      status: draft.status,
      taste_rating:
        draft.status === "da_den" ? draft.taste_rating || null : null,
      lat: coordinates ? Number(coordinates[1]) : (restaurant?.lat ?? null),
      lng: coordinates ? Number(coordinates[2]) : (restaurant?.lng ?? null),
      geocode_source: coordinates
        ? "manual"
        : restaurant?.geocode_source || "unset",
      geocode_confidence: coordinates
        ? "manual"
        : restaurant?.geocode_confidence || "low",
    };
    setSaving(true);
    setError(null);
    const query = restaurant
      ? supabase
          .from("restaurants")
          .update(payload)
          .eq("id", restaurant.id)
          .select()
          .single()
      : supabase.from("restaurants").insert(payload).select().single();
    const { data, error: saveError } = await query;
    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }
    if (!coordinates && !restaurant && draft.address_raw.trim()) {
      try {
        const response = await fetch(
          `/api/geocode?name=${encodeURIComponent(draft.name)}&address=${encodeURIComponent(draft.address_raw)}`,
        );
        const { result } = await response.json();
        if (result)
          await supabase
            .from("restaurants")
            .update({
              lat: result.lat,
              lng: result.lng,
              geocode_source: "nominatim",
              geocode_confidence: "low",
            })
            .eq("id", data.id);
      } catch {}
    }
    await onSaved();
    setSaving(false);
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c130d]/35 p-0 backdrop-blur-sm md:items-center md:p-6">
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[28px] bg-[#fbf3ea] p-5 shadow-2xl dark:bg-[#281b13] md:rounded-[20px]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-extrabold tracking-wider text-[#a35e2d]">
              PROT FOOD
            </p>
            <h2 className="text-xl font-extrabold">
              {restaurant ? "Sửa quán" : "Thêm quán"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-full bg-[#402c1e]/8 p-2"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Tên quán *">
            <input
              required
              autoFocus
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputClass}
              placeholder="Ví dụ: Bún chả Ngọc Xuân"
            />
          </Field>
          {candidates.length > 0 && (
            <div className="rounded-xl border border-[#e5a36a]/60 bg-[#e5a36a]/15 px-3 py-2.5 text-xs">
              <p className="font-extrabold text-[#70421f]">
                Có thể đã có trong danh sách
              </p>
              {candidates.map((item) => (
                <p key={item.id} className="mt-1 text-[#6b5644]">
                  {item.name}
                  {item.address_raw && ` · ${item.address_raw}`}
                </p>
              ))}
            </div>
          )}
          <Field label="Địa chỉ">
            <input
              value={draft.address_raw}
              onChange={(e) => set("address_raw", e.target.value)}
              className={inputClass}
              placeholder="Số nhà, đường, Hà Nội"
            />
            <p className="mt-1 text-[11px] text-[#8a7360]">
              Có thể để trống và bổ sung sau.
            </p>
          </Field>
          <Field label="Ghi chú">
            <textarea
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              className={`${inputClass} min-h-24 resize-y`}
              placeholder="Điều cần nhớ về quán..."
            />
          </Field>
          <Field label="Trạng thái">
            <div className="flex gap-2">
              <Chip
                active={draft.status === "muon_den"}
                onClick={() => set("status", "muon_den")}
              >
                Muốn đến
              </Chip>
              <Chip
                active={draft.status === "da_den"}
                onClick={() => set("status", "da_den")}
              >
                Đã đến
              </Chip>
            </div>
          </Field>
          {draft.status === "da_den" && (
            <Field label="Đánh giá">
              <div className="flex gap-2">
                <Chip
                  active={draft.taste_rating === "ngon"}
                  onClick={() =>
                    set(
                      "taste_rating",
                      draft.taste_rating === "ngon" ? "" : "ngon",
                    )
                  }
                >
                  👍 Ngon
                </Chip>
                <Chip
                  active={draft.taste_rating === "khong_ngon"}
                  onClick={() =>
                    set(
                      "taste_rating",
                      draft.taste_rating === "khong_ngon" ? "" : "khong_ngon",
                    )
                  }
                >
                  👎 Không ngon
                </Chip>
              </div>
            </Field>
          )}
          <button
            type="button"
            onClick={() => setAdvanced((value) => !value)}
            className="text-sm font-bold text-[#a35e2d]"
          >
            {advanced ? "Ẩn sửa vị trí nâng cao" : "Sửa vị trí khi geocode sai"}
          </button>
          {advanced && (
            <Field label="Toạ độ (lat, lng)">
              <input
                value={draft.coordinates}
                onChange={(e) => set("coordinates", e.target.value)}
                className={inputClass}
                placeholder="21.0369, 105.8226"
              />
              <p className="mt-1 text-[11px] text-[#8a7360]">
                Dán từ Google Maps khi bạn đã kiểm tra chính xác vị trí.
              </p>
            </Field>
          )}
          {error && (
            <p className="rounded-xl bg-red-900/10 px-3 py-2 text-[13px] text-red-800 dark:text-red-200">
              {error}
            </p>
          )}
          <button
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#a35e2d] py-3 text-[14px] font-extrabold text-white transition hover:bg-[#8e4f26] disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? "Đang lưu…" : "Lưu quán"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Detail({
  restaurant,
  onClose,
  onEdit,
  onDelete,
  onStatus,
  onTaste,
  travelMode,
}: {
  restaurant: Restaurant;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (status: Status) => Promise<void>;
  onTaste: (taste: "ngon" | "khong_ngon" | null) => Promise<void>;
  travelMode: TravelMode;
}) {
  const [updating, setUpdating] = useState(false);
  const update = async (task: () => Promise<void>) => {
    setUpdating(true);
    await task();
    setUpdating(false);
  };
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#1c130d]/30 backdrop-blur-sm">
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-[#fbf3ea] px-5 py-6 shadow-2xl dark:bg-[#281b13]">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center gap-1 rounded-xl bg-[#402c1e]/8 px-3 py-2 text-sm font-bold"
          >
            <ChevronLeft size={18} />
            Quay lại
          </button>
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="rounded-xl bg-[#402c1e]/8 p-2.5"
              aria-label="Sửa"
            >
              <Pencil size={17} />
            </button>
            <button
              onClick={onDelete}
              className="rounded-xl bg-red-900/10 p-2.5 text-red-800 dark:text-red-200"
              aria-label="Xoá"
            >
              <Trash2 size={17} />
            </button>
          </div>
        </div>
        <p className="text-[11px] font-extrabold tracking-wider text-[#a35e2d]">
          CHI TIẾT QUÁN
        </p>
        <h2 className="mt-1 text-3xl font-extrabold leading-tight">
          {restaurant.name}
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge status={restaurant.status} />
          <TasteBadge taste={restaurant.taste_rating} />
          {restaurant.geocode_confidence === "low" && (
            <span className="rounded-full bg-[#e5a36a]/25 px-3 py-1 text-xs font-bold text-[#70421f]">
              Cần kiểm tra vị trí
            </span>
          )}
        </div>
        <div className="glass mt-6 rounded-[20px] p-4">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-[#6b5644] dark:text-[#cbb4a0]">
            <MapPin size={18} className="mt-0.5 shrink-0 text-[#a35e2d]" />
            {restaurant.address_raw || "Chưa có địa chỉ"}
            {restaurant.admin_wards && (
              <>
                <br />
                {restaurant.admin_wards.name}
              </>
            )}
          </p>
          <a
            href={directionsUrl(restaurant, travelMode)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#402c1e] py-3 text-sm font-extrabold text-[#fbf3ea]"
          >
            <Navigation size={16} />
            Mở Google Maps
          </a>
        </div>
        <section className="mt-7">
          <SectionTitle>Trạng thái</SectionTitle>
          <div className="flex gap-2">
            <Chip
              active={restaurant.status === "muon_den"}
              onClick={() => update(() => onStatus("muon_den"))}
            >
              Muốn đến
            </Chip>
            <Chip
              active={restaurant.status === "da_den"}
              onClick={() => update(() => onStatus("da_den"))}
            >
              Đã đến
            </Chip>
          </div>
        </section>
        {restaurant.status === "da_den" && (
          <section className="mt-6">
            <SectionTitle>Đánh giá</SectionTitle>
            <div className="flex gap-2">
              <Chip
                active={restaurant.taste_rating === "ngon"}
                onClick={() =>
                  update(() =>
                    onTaste(restaurant.taste_rating === "ngon" ? null : "ngon"),
                  )
                }
              >
                👍 Ngon
              </Chip>
              <Chip
                active={restaurant.taste_rating === "khong_ngon"}
                onClick={() =>
                  update(() =>
                    onTaste(
                      restaurant.taste_rating === "khong_ngon"
                        ? null
                        : "khong_ngon",
                    ),
                  )
                }
              >
                👎 Không ngon
              </Chip>
            </div>
          </section>
        )}
        {restaurant.notes && (
          <section className="mt-7">
            <SectionTitle>Ghi chú</SectionTitle>
            <p className="rounded-xl bg-[#402c1e]/6 p-3 text-sm leading-relaxed text-[#6b5644] dark:text-[#cbb4a0]">
              {restaurant.notes}
            </p>
          </section>
        )}
        {updating && (
          <p className="mt-5 text-sm text-[#8a7360]">Đang cập nhật…</p>
        )}
      </aside>
    </div>
  );
}

function MonthlyReviewQueue() {
  const [items, setItems] = useState<
    Array<{ id: string; reason: string; restaurants: Restaurant | null }>
  >([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: queue } = await supabase
        .from("review_queue")
        .select("id, reason, restaurant_id")
        .eq("status", "open")
        .order("due_at");
      const queueRows = queue || [];
      if (!queueRows.length) return;
      const { data: restaurants } = await supabase
        .from("restaurants")
        .select("*")
        .in(
          "id",
          queueRows.map((item) => item.restaurant_id),
        );
      const byId = new Map(
        (restaurants || []).map((restaurant) => [
          restaurant.id,
          restaurant as Restaurant,
        ]),
      );
      setItems(
        queueRows.map((item) => ({
          id: item.id,
          reason: item.reason,
          restaurants: byId.get(item.restaurant_id) || null,
        })),
      );
    })();
  }, []);
  const resolve = async (
    item: { id: string; restaurants: Restaurant | null },
    closed = false,
  ) => {
    const restaurant = item.restaurants;
    if (!supabase || !restaurant) return;
    setSavingId(item.id);
    const restaurantUpdate = closed
      ? { location_verification: "closed" }
      : {
          location_verification: "verified",
          last_verified_at: new Date().toISOString().slice(0, 10),
          next_review_at: new Date(Date.now() + 180 * 86_400_000)
            .toISOString()
            .slice(0, 10),
        };
    await supabase
      .from("restaurants")
      .update(restaurantUpdate)
      .eq("id", restaurant.id);
    await supabase
      .from("review_queue")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", item.id);
    setItems((current) => current.filter((value) => value.id !== item.id));
    setSavingId(null);
  };
  if (!items.length) return null;
  return (
    <section className="mt-5 overflow-hidden rounded-[20px] border border-[#e5a36a]/45 bg-[#e5a36a]/10">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-extrabold">Cần rà soát tháng này</p>
          <p className="mt-0.5 text-xs text-[#8a7360]">
            {items.length} quán đang chờ bạn xác minh
          </p>
        </div>
        <span className="rounded-full bg-[#e5a36a]/30 px-2.5 py-1 text-xs font-bold text-[#70421f]">
          {items.length}
        </span>
      </div>
      <div className="divide-y divide-[#402c1e]/8 bg-white/25 dark:bg-black/5">
        {items.map((item) => {
          const restaurant = item.restaurants;
          return (
            <div key={item.id} className="px-4 py-3">
              <p className="text-sm font-bold">
                {restaurant?.name || "Quán đã bị xoá"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#8a7360]">
                {item.reason}
              </p>
              {restaurant && (
                <>
                  <a
                    href={directionsUrl(restaurant)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#a35e2d]"
                  >
                    <Navigation size={13} />
                    Kiểm tra trên Google Maps
                  </a>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      disabled={savingId === item.id}
                      onClick={() => resolve(item)}
                      className="rounded-lg bg-[#402c1e] px-2.5 py-1.5 text-xs font-bold text-[#fbf3ea] disabled:opacity-60"
                    >
                      Thông tin đúng
                    </button>
                    <button
                      disabled={savingId === item.id}
                      onClick={() => resolve(item, true)}
                      className="rounded-lg bg-red-900/10 px-2.5 py-1.5 text-xs font-bold text-red-800 disabled:opacity-60"
                    >
                      Quán đã đóng
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-[#8a7360]">
                    Nếu đổi tên hoặc địa chỉ: mở quán trong Danh sách → Sửa. App
                    sẽ lưu lịch sử thay đổi.
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReportTable({
  title,
  rows,
  verified,
}: {
  title: string;
  rows: ReturnType<typeof makeLocationReport>["verified"];
  verified: boolean;
}) {
  return (
    <>
      <section className="glass overflow-hidden rounded-[20px]">
        <div className="flex items-center justify-between border-b border-[#402c1e]/10 px-4 py-3">
          <div>
            <p className="text-sm font-extrabold">{title}</p>
            <p className="mt-0.5 text-xs text-[#8a7360]">{rows.length} quán</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${verified ? "bg-emerald-700/12 text-emerald-800 dark:text-emerald-300" : "bg-[#e5a36a]/25 text-[#70421f] dark:text-[#f1c496]"}`}
          >
            {verified ? "Đã kiểm chứng" : "Cần review"}
          </span>
        </div>
        <div className="divide-y divide-[#402c1e]/8">
          {rows.length ? (
            rows.map((row) => (
              <div key={`${row.name}-${row.address}`} className="px-4 py-3">
                <p className="truncate text-sm font-bold">{row.name}</p>
                <p className="mt-0.5 text-xs text-[#8a7360]">
                  {row.address}
                  {row.ward && ` · ${row.ward}`}
                </p>
                {!verified && (
                  <p className="mt-2 text-xs leading-relaxed text-[#8a7360]">
                    {row.reviewReason}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="px-4 py-8 text-center text-sm text-[#8a7360]">
              Chưa có dữ liệu.
            </p>
          )}
        </div>
      </section>
      {!verified && <MonthlyReviewQueue />}
    </>
  );
}

function ReportView({
  restaurants,
  notify,
}: {
  restaurants: Restaurant[];
  notify: (message: string) => void;
}) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const report = useMemo(() => makeLocationReport(restaurants), [restaurants]);
  const exportFile = async (format: "csv" | "excel" | "pdf") => {
    setExporting(format);
    try {
      if (format === "csv") downloadCsv(report);
      if (format === "excel") await downloadExcel(report);
      if (format === "pdf") await downloadPdf(report);
      notify(`Đã tải báo cáo ${format.toUpperCase()}.`);
      setDownloadOpen(false);
    } catch {
      notify("Không thể tạo file. Hãy thử lại.");
    } finally {
      setExporting(null);
    }
  };
  const card = (label: string, value: number, tone: string, detail: string) => (
    <div className="glass rounded-[20px] p-4">
      <p className="text-xs font-bold text-[#8a7360]">{label}</p>
      <p className={`mt-1 text-4xl font-extrabold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-[#8a7360]">{detail}</p>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">Tổng quan vị trí</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#8a7360]">
            Theo dõi chất lượng dữ liệu ghim quán. Những dòng chưa kiểm chứng sẽ
            không dùng tọa độ cho chỉ đường.
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setDownloadOpen((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#402c1e] px-4 py-2.5 text-sm font-extrabold text-[#fbf3ea]"
          >
            <Download size={16} />
            Download
            <ChevronDown
              size={15}
              className={downloadOpen ? "rotate-180" : ""}
            />
          </button>
          {downloadOpen && (
            <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-[#402c1e]/10 bg-[#fffaf4]/95 p-1.5 shadow-2xl backdrop-blur-xl dark:bg-[#35251b]/95">
              <p className="px-3 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-wider text-[#8a7360]">
                Xuất báo cáo
              </p>
              {(["csv", "excel", "pdf"] as const).map((format) => (
                <button
                  key={format}
                  disabled={Boolean(exporting)}
                  onClick={() => exportFile(format)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-[#402c1e]/7 disabled:opacity-60"
                >
                  {format === "csv" ? (
                    <FileText size={17} className="text-[#a35e2d]" />
                  ) : format === "excel" ? (
                    <FileSpreadsheet size={17} className="text-[#a35e2d]" />
                  ) : (
                    <FileType2 size={17} className="text-[#a35e2d]" />
                  )}
                  <span className="flex-1">
                    {format === "csv"
                      ? "CSV"
                      : format === "excel"
                        ? "Excel"
                        : "PDF"}
                  </span>
                  <span className="text-[10px] font-medium text-[#8a7360]">
                    {format === "csv"
                      ? "Dữ liệu thô"
                      : format === "excel"
                        ? "3 sheet"
                        : "Chia sẻ"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {card(
          "Tổng số quán",
          report.total,
          "text-[#402c1e] dark:text-[#f7eadc]",
          "Toàn bộ danh sách hiện tại",
        )}
        {card(
          "Đã đối chiếu",
          report.verified.length,
          "text-emerald-700 dark:text-emerald-300",
          "Pin đã được kiểm chứng",
        )}
        {card(
          "Mơ hồ cần xem xét",
          report.ambiguous.length,
          "text-[#a35e2d]",
          "Không dùng pin tự động để chỉ đường",
        )}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ReportTable title="Đã đối chiếu" rows={report.verified} verified />
        <ReportTable
          title="Mơ hồ cần xem xét"
          rows={report.ambiguous}
          verified={false}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("nearby");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [roadRoutes, setRoadRoutes] = useState<Record<string, RoadRoute>>({});
  const [routingState, setRoutingState] = useState<
    "idle" | "loading" | "ready" | "unavailable"
  >("idle");
  const [travelMode, setTravelMode] = useState<TravelMode>("two-wheeler");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<FilterStatus>("all");
  const [category, setCategory] = useState("all");
  const [ward, setWard] = useState("all");
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [formTarget, setFormTarget] = useState<Restaurant | null | undefined>(
    undefined,
  );
  const [toast, setToast] = useState<string | null>(null);
  const locationWatchRef = useRef<number | null>(null);
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  };
  const setPreferredTravelMode = (mode: TravelMode) => {
    setTravelMode(mode);
    window.localStorage.setItem("prot-food-travel-mode", mode);
  };
  async function refresh() {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("restaurants")
      .select("*, admin_wards(*)")
      .order("created_at", { ascending: false });
    if (error) setLoadError(`Không thể kết nối dữ liệu (${error.message}). Hãy thử tải lại.`);
    else {
      setRestaurants(data as Restaurant[]);
      setLoadError(null);
    }
    setLoading(false);
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    const savedMode = window.localStorage.getItem("prot-food-travel-mode");
    if (savedMode === "two-wheeler" || savedMode === "driving")
      setTravelMode(savedMode);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const getLocation = useCallback(() => {
    if (!navigator.geolocation)
      return setLocationError("Trình duyệt này không hỗ trợ vị trí.");
    if (locationWatchRef.current != null)
      navigator.geolocation.clearWatch(locationWatchRef.current);
    setLocationError(null);
    const onPosition = (result: GeolocationPosition) =>
      setPosition({ lat: result.coords.latitude, lng: result.coords.longitude });
    const onError = () =>
        setLocationError(
          "Chưa lấy được vị trí. Bạn có thể chọn phường/xã để lọc gần đúng.",
        );
    const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
    navigator.geolocation.getCurrentPosition(onPosition, onError, options);
    locationWatchRef.current = navigator.geolocation.watchPosition(onPosition, onError, options);
  }, []);
  useEffect(() => {
    if (tab !== "nearby") return;
    getLocation();
    return () => {
      if (locationWatchRef.current != null)
        navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    };
  }, [tab, getLocation]);
  const categories = useMemo(
    () =>
      [
        ...new Set(
          restaurants
            .map((item) => item.category)
            .filter((item): item is string => Boolean(item)),
        ),
      ].sort((a, b) => a.localeCompare(b, "vi")),
    [restaurants],
  );
  const wards = useMemo(
    () =>
      [
        ...new Set(
          restaurants
            .map((item) => item.admin_wards?.name)
            .filter((item): item is string => Boolean(item)),
        ),
      ].sort((a, b) => a.localeCompare(b, "vi")),
    [restaurants],
  );
  const filtered = useMemo(
    () =>
      restaurants.filter((item) => {
        const q = searchQuery.trim().toLocaleLowerCase("vi");
        const haystack = [
          item.name,
          item.address_raw,
          item.notes,
          item.admin_wards?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("vi");
        return (
          (!q || haystack.includes(q)) &&
          (status === "all" || item.status === status) &&
          (category === "all" || item.category === category) &&
          (ward === "all" || item.admin_wards?.name === ward)
        );
      }),
    [restaurants, searchQuery, status, category, ward],
  );
  const nearbyByAir = useMemo(
    () =>
      filtered
        .map((item) => ({
          item,
          airDistance:
            position &&
            item.lat != null &&
            item.lng != null
              ? haversineKm(position.lat, position.lng, item.lat, item.lng)
              : undefined,
        }))
        .sort(
          (a, b) =>
            (a.airDistance ?? Infinity) - (b.airDistance ?? Infinity),
        ),
    [filtered, position],
  );
  const routeCandidates = useMemo(
    () =>
      nearbyByAir
        .filter(({ item, airDistance }) => airDistance != null && isRouteEligible(item))
        .slice(0, ROUTE_CANDIDATE_LIMIT)
        .map(({ item }) => ({ id: item.id, lat: item.lat!, lng: item.lng! })),
    [nearbyByAir],
  );
  const routeCandidateKey = useMemo(
    () => routeCandidates.map((item) => item.id).join(","),
    [routeCandidates],
  );
  useEffect(() => {
    if (tab !== "nearby" || !position || !routeCandidates.length) {
      setRoadRoutes({});
      setRoutingState("idle");
      return;
    }
    const cacheKey = routeCacheKey(position);
    const cachedRaw = window.localStorage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as RouteCache;
        if (Date.now() - cached.savedAt < ROUTE_CACHE_MS) {
          setRoadRoutes(cached.routes);
          setRoutingState("ready");
          return;
        }
      } catch {
        window.localStorage.removeItem(cacheKey);
      }
    }

    const controller = new AbortController();
    setRoadRoutes({});
    setRoutingState("loading");
    (async () => {
      try {
        const response = await fetch("/api/routing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin: position, destinations: routeCandidates }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Routing không phản hồi");
        const data = (await response.json()) as {
          distances: Record<string, number | null>;
        };
        const routes: Record<string, RoadRoute> = {};
        for (const [id, meters] of Object.entries(data.distances)) {
          if (typeof meters === "number" && meters > 0)
            routes[id] = { distanceKm: meters / 1000 };
        }
        if (!controller.signal.aborted) {
          setRoadRoutes(routes);
          setRoutingState("ready");
          window.localStorage.setItem(
            cacheKey,
            JSON.stringify({ savedAt: Date.now(), routes } satisfies RouteCache),
          );
        }
      } catch {
        if (!controller.signal.aborted) setRoutingState("unavailable");
      }
    })();
    return () => controller.abort();
  }, [tab, position, routeCandidateKey, routeCandidates]);
  const nearby = useMemo(
    () =>
      nearbyByAir
        .map(({ item, airDistance }) => ({
          item,
          airDistance,
          roadRoute: roadRoutes[item.id],
        }))
        .sort(
          (a, b) =>
            (a.roadRoute?.distanceKm ?? a.airDistance ?? Infinity) -
            (b.roadRoute?.distanceKm ?? b.airDistance ?? Infinity),
        ),
    [nearbyByAir, roadRoutes],
  );
  const visited = restaurants.filter((item) => item.status === "da_den");
  const good = visited.filter((item) => item.taste_rating === "ngon");
  const bad = visited.filter((item) => item.taste_rating === "khong_ngon");
  async function updateRestaurant(
    restaurant: Restaurant,
    update: Record<string, unknown>,
  ) {
    if (!supabase) return;
    const { error } = await supabase
      .from("restaurants")
      .update(update)
      .eq("id", restaurant.id);
    if (error) return notify(error.message);
    const next = { ...restaurant, ...update } as Restaurant;
    setSelected(next);
    await refresh();
    notify("Đã cập nhật.");
  }
  async function setRestaurantStatus(
    restaurant: Restaurant,
    nextStatus: Status,
  ) {
    if (
      nextStatus === "muon_den" &&
      restaurant.taste_rating &&
      !window.confirm("Chuyển về Muốn đến sẽ xoá đánh giá hiện tại. Tiếp tục?")
    )
      return;
    await updateRestaurant(
      restaurant,
      nextStatus === "muon_den"
        ? { status: nextStatus, taste_rating: null }
        : { status: nextStatus },
    );
  }
  async function afterSave() {
    await refresh();
    notify("Đã lưu quán.");
  }
  async function deleteSelected() {
    if (
      !selected ||
      !supabase ||
      !window.confirm(`Xoá “${selected.name}”? Không thể hoàn tác.`)
    )
      return;
    const { error } = await supabase
      .from("restaurants")
      .delete()
      .eq("id", selected.id);
    if (error) return notify(error.message);
    setSelected(null);
    await refresh();
    notify("Đã xoá quán.");
  }
  const filterRow = (withWard = false) => (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={status === "all"} onClick={() => setStatus("all")}>
          Tất cả
        </Chip>
        <Chip
          active={status === "muon_den"}
          onClick={() => setStatus("muon_den")}
        >
          Muốn đến
        </Chip>
        <Chip active={status === "da_den"} onClick={() => setStatus("da_den")}>
          Đã đến
        </Chip>
      </div>
      <SectionTitle>Nhóm món</SectionTitle>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={category === "all"} onClick={() => setCategory("all")}>
          Tất cả
        </Chip>
        {categories.map((value) => (
          <Chip
            key={value}
            active={category === value}
            onClick={() => setCategory(value)}
          >
            {value}
          </Chip>
        ))}
      </div>
      {withWard && (
        <>
          <SectionTitle>Phường / xã</SectionTitle>
          <select
            value={ward}
            onChange={(event) => setWard(event.target.value)}
            className={`${inputClass} py-2`}
          >
            <option value="all">Tất cả phường / xã có quán</option>
            {wards.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </>
      )}
    </>
  );
  const navItems = [
    { id: "nearby" as const, label: "Gần đây", icon: Compass },
    { id: "list" as const, label: "Danh sách", icon: List },
    { id: "profile" as const, label: "Cá nhân", icon: UserRound },
    { id: "report" as const, label: "Báo cáo", icon: BarChart3 },
  ];
  const pageTitle =
    tab === "nearby"
      ? "Gần đây"
      : tab === "list"
        ? "Danh sách"
        : tab === "profile"
          ? "Cá nhân"
          : "Báo cáo";
  const pageSubtitle =
    tab === "nearby"
      ? "Quán quanh vị trí hiện tại của bạn"
      : tab === "list"
        ? `${restaurants.length} quán · ${visited.length} đã đến`
        : tab === "profile"
          ? "Danh sách ăn uống của bạn"
          : "Tổng hợp và xuất dữ liệu vị trí";
  return (
    <main className="app-background min-h-screen">
      <PwaRegister />
      <div className="mx-auto flex min-h-screen max-w-6xl">
        <aside className="hidden w-60 flex-col border-r border-[#402c1e]/10 px-4 py-7 md:flex">
          <p className="px-3 text-xs font-extrabold tracking-[0.18em] text-[#a35e2d]">
            PROT FOOD
          </p>
          <h1 className="px-3 pt-1 text-2xl font-extrabold">
            Quán ngon
            <br />
            Hà Nội
          </h1>
          <nav className="mt-10 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold ${tab === item.id ? "bg-[#402c1e] text-[#fbf3ea]" : "text-[#6b5644] dark:text-[#cbb4a0]"}`}
              >
                <item.icon size={19} />
                {item.label}
              </button>
            ))}
          </nav>
          <p className="mt-auto px-3 text-xs leading-relaxed text-[#8a7360]">
            PWA cá nhân · không có bản đồ trong app.<br />v2.0.0
          </p>
        </aside>
        <section className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 md:px-10 md:pb-10">
          <header className="mb-5">
            <p className="text-[11px] font-extrabold tracking-[0.18em] text-[#a35e2d] md:hidden">
              PROT FOOD · v2.0.0
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
              {pageTitle}
            </h1>
            <p className="mt-1 text-sm text-[#8a7360]">{pageSubtitle}</p>
          </header>
          {!isSupabaseConfigured && (
            <div className="mb-5 flex gap-3 rounded-2xl border border-[#e5a36a]/60 bg-[#e5a36a]/18 p-4 text-sm text-[#70421f]">
              <CircleAlert className="mt-0.5 shrink-0" size={18} />
              <p>
                Chưa kết nối Supabase. Thêm biến môi trường để tải danh sách.
              </p>
            </div>
          )}
          {loadError && (
            <div className="mb-5 rounded-xl bg-red-900/10 p-3 text-sm text-red-800">
              Không tải được dữ liệu: {loadError}
            </div>
          )}
          {tab === "nearby" && (
            <div>
              <div className="glass mb-4 rounded-[20px] p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-[#a35e2d]/12 p-2.5 text-[#a35e2d]">
                    <Navigation size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {position
                        ? "Đang dùng vị trí hiện tại"
                        : "Chưa có vị trí"}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8a7360]">
                      {position
                        ? routingState === "loading"
                          ? "Đang tính quãng đường theo mạng lưới đường…"
                          : routingState === "ready"
                            ? `${Object.keys(roadRoutes).length} quán gần nhất có quãng đường đi`
                            : routingState === "unavailable"
                              ? "Tạm dùng khoảng cách đường thẳng"
                              : `${nearby.filter((item) => item.airDistance != null).length} quán có thể tính khoảng cách`
                        : locationError || "Đang xin quyền vị trí…"}
                    </p>
                  </div>
                  <button
                    onClick={getLocation}
                    className="rounded-xl bg-[#402c1e]/8 p-2.5"
                    aria-label="Lấy lại vị trí"
                  >
                    <RefreshCw size={17} />
                  </button>
                </div>
                {position && (
                  <>
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#402c1e]/5 px-3 py-2.5 dark:bg-[#f7eadc]/8">
                      <div>
                        <p className="text-xs font-bold">Chỉ đường mặc định</p>
                        <p className="mt-0.5 text-[11px] text-[#8a7360]">
                          Google Maps dùng vị trí hiện tại của máy
                        </p>
                      </div>
                      <div className="flex rounded-lg bg-white/70 p-0.5 dark:bg-black/10">
                        <button
                          onClick={() => setPreferredTravelMode("two-wheeler")}
                          className={`rounded-md px-2 py-1.5 text-[11px] font-bold ${travelMode === "two-wheeler" ? "bg-[#402c1e] text-[#fbf3ea]" : "text-[#6b5644] dark:text-[#cbb4a0]"}`}
                        >
                          <Bike className="mr-1 inline" size={13} /> Xe máy
                        </button>
                        <button
                          onClick={() => setPreferredTravelMode("driving")}
                          className={`rounded-md px-2 py-1.5 text-[11px] font-bold ${travelMode === "driving" ? "bg-[#402c1e] text-[#fbf3ea]" : "text-[#6b5644] dark:text-[#cbb4a0]"}`}
                        >
                          <CarFront className="mr-1 inline" size={13} /> Ô tô
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-[#8a7360]">
                      “Đường đi” là ước tính theo dữ liệu đường OSM, không gồm kẹt xe. Quán có pin cần xem xét chỉ hiện khoảng cách thẳng.
                    </p>
                  </>
                )}
                {!position && wards.length > 0 && (
                  <select
                    value={ward}
                    onChange={(event) => setWard(event.target.value)}
                    className={`${inputClass} mt-3 py-2 text-xs`}
                  >
                    <option value="all">
                      Hoặc chọn phường/xã để lọc gần đúng
                    </option>
                    {wards.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                )}
              </div>
              {filterRow()}
              <div className="mt-4">
                {loading ? (
                  <Loading />
                ) : nearby.length ? (
                  nearby.map(({ item, airDistance, roadRoute }) => (
                    <RestaurantCard
                      key={item.id}
                      restaurant={item}
                      airDistance={airDistance}
                      roadRoute={roadRoute}
                      travelMode={travelMode}
                      onOpen={() => setSelected(item)}
                    />
                  ))
                ) : (
                  <Empty text="Chưa có quán nào khớp bộ lọc." />
                )}
              </div>
            </div>
          )}
          {tab === "list" && (
            <div>
              <div className="glass mb-4 flex items-center gap-2 rounded-2xl px-4 py-3">
                <Search size={18} className="shrink-0 text-[#a35e2d]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm quán, địa chỉ, ghi chú…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[#8a7360]"
                />
              </div>
              {filterRow(true)}
              <div className="mt-4">
                {loading ? (
                  <Loading />
                ) : filtered.length ? (
                  filtered.map((item) => (
                    <RestaurantCard
                      key={item.id}
                      restaurant={item}
                      onOpen={() => setSelected(item)}
                    />
                  ))
                ) : (
                  <Empty text="Không tìm thấy quán nào khớp bộ lọc." />
                )}
              </div>
            </div>
          )}
          {tab === "profile" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat
                  label="Đã đến"
                  value={visited.length}
                  detail={`trên ${restaurants.length} quán`}
                  tone="text-[#a35e2d]"
                />
                <Stat
                  label="Muốn đến"
                  value={restaurants.length - visited.length}
                  detail="đã lưu để thử"
                  tone="text-[#402c1e] dark:text-[#f7eadc]"
                />
                <Stat
                  label="Ngon"
                  value={good.length}
                  detail="quán bạn muốn nhớ"
                  tone="text-emerald-700 dark:text-emerald-300"
                />
                <Stat
                  label="Không ngon"
                  value={bad.length}
                  detail="để tránh lần sau"
                  tone="text-red-700 dark:text-red-300"
                />
              </div>
              <section className="glass rounded-[20px] p-4">
                <p className="text-sm font-extrabold">Chỉ đường mặc định</p>
                <p className="mt-1 text-xs text-[#8a7360]">
                  Dùng khi mở Google Maps; lựa chọn được lưu trên thiết bị này.
                </p>
                <div className="mt-3 flex gap-2">
                  <Chip
                    active={travelMode === "two-wheeler"}
                    onClick={() => setPreferredTravelMode("two-wheeler")}
                  >
                    <Bike className="mr-1 inline" size={14} /> Xe máy
                  </Chip>
                  <Chip
                    active={travelMode === "driving"}
                    onClick={() => setPreferredTravelMode("driving")}
                  >
                    <CarFront className="mr-1 inline" size={14} /> Ô tô
                  </Chip>
                </div>
              </section>
            </div>
          )}
          {tab === "report" && (
            <ReportView restaurants={restaurants} notify={notify} />
          )}
        </section>
      </div>
      {tab !== "profile" && tab !== "report" && (
        <button
          onClick={() => setFormTarget(null)}
          className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#a35e2d] text-white shadow-lg shadow-[#a35e2d]/35 transition hover:scale-105 active:scale-95 md:bottom-7 md:right-8"
          aria-label="Thêm quán"
        >
          <Plus size={26} strokeWidth={2.7} />
        </button>
      )}
      <nav className="glass fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-md items-center justify-around rounded-[22px] px-2 py-2 md:hidden">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-bold ${tab === item.id ? "bg-[#402c1e] text-[#fbf3ea]" : "text-[#6b5644] dark:text-[#cbb4a0]"}`}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        ))}
      </nav>
      {selected && (
        <Detail
          restaurant={selected}
          onClose={() => setSelected(null)}
          onEdit={() => setFormTarget(selected)}
          onDelete={deleteSelected}
          onStatus={(nextStatus) => setRestaurantStatus(selected, nextStatus)}
          onTaste={(taste) =>
            updateRestaurant(selected, { taste_rating: taste })
          }
          travelMode={travelMode}
        />
      )}
      {formTarget !== undefined && (
        <RestaurantForm
          restaurant={formTarget}
          restaurants={restaurants}
          onClose={() => setFormTarget(undefined)}
          onSaved={afterSave}
        />
      )}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-[#402c1e] px-4 py-2 text-sm font-bold text-[#fbf3ea] shadow-xl md:bottom-6">
          {toast}
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: string;
}) {
  return (
    <div className="glass rounded-[20px] p-5">
      <p className="text-sm text-[#8a7360]">{label}</p>
      <p className={`mt-1 text-4xl font-extrabold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-[#8a7360]">{detail}</p>
    </div>
  );
}
function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#8a7360]">
      <Loader2 className="animate-spin" size={18} />
      Đang tải danh sách…
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="glass rounded-[20px] px-5 py-12 text-center">
      <Utensils className="mx-auto text-[#a35e2d]" size={26} />
      <p className="mt-3 text-sm text-[#8a7360]">{text}</p>
    </div>
  );
}
