"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bike,
  Bird,
  CarFront,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Compass,
  ClipboardPaste,
  Download,
  Dices,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FileType2,
  Flame,
  Loader2,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { PwaRegister } from "@/components/pwa-register";
import { CategoryBadge } from "@/components/category-badge";
import { FoodFootprint } from "@/components/food-footprint";
import { FoodRoulette } from "@/components/food-roulette";
import { CollectionPicker } from "@/components/collection-picker";
import { CollectionImportModal } from "@/components/collection-import-modal";
import { QuickContextFilter, type QuickContext } from "@/components/quick-context-filter";
import { SearchableWardModal, type WardOption } from "@/components/searchable-ward-modal";
import { SkeletonCard } from "@/components/skeleton-card";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { smartEstimatedDistanceKm } from "@/lib/hanoi-obstacles";
import { decodePlusCode, extractPlusCode } from "@/lib/plus-codes";
import type { Collection, Restaurant, RestaurantDraft, Status, VisitLog, Ward } from "@/lib/types";
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

type Tab = "nearby" | "profile" | "roulette" | "settings";
type FilterStatus = "all" | Status;
type Position = { lat: number; lng: number };
type RoadRoute = { distanceKm: number; isEstimated?: boolean };
type GeocodeResult = {
  lat: number;
  lng: number;
  formattedAddress?: string;
  wardName?: string | null;
  confidence?: "high" | "medium" | "low";
  source?: "nominatim" | "plus_code";
};
type RouteCache = {
  savedAt: number;
  routes: Record<string, RoadRoute>;
};

const ROUTE_CACHE_MS = 10 * 60 * 1_000;
const ROUTE_CANDIDATE_LIMIT = 25;
// GPS updates can arrive several times per second while moving. Recalculate
// routes only after a meaningful move, otherwise the routing service rate
// limit would make the UI alternate between loading and fallback states.
const ROUTE_RECALCULATION_DISTANCE_KM = 0.15;
const ROUTE_RECALCULATION_DEBOUNCE_MS = 2_500;

function routeCacheKey(position: Position) {
  // Around 110m in Hanoi: accurate enough to cache without needlessly sharing
  // a new precise GPS coordinate as the user takes a few steps.
  return `prot-food-route-v3.1:${position.lat.toFixed(3)}:${position.lng.toFixed(3)}`;
}

function isRouteEligible(restaurant: Restaurant) {
  return (
    restaurant.lat != null &&
    restaurant.lng != null &&
    restaurant.location_verification !== "closed"
  );
}

const emptyDraft = (): RestaurantDraft => ({
  name: "",
  address_raw: "",
  category: "",
  notes: "",
  status: "muon_den",
  taste_rating: "",
  coordinates: "",
});

function clipboardAddressSuggestion(value: string) {
  const text = value.trim();
  if (!text) return null;
  if (extractPlusCode(text)) return text;
  const isMapsLink = /(?:google\.[^/]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(text);
  const includesHanoi = /hà\s*nội|ha\s*noi/i.test(text);
  if (!isMapsLink && !includesHanoi) return null;
  if (isMapsLink) {
    try {
      const url = new URL(text);
      const query = url.searchParams.get("q") || url.searchParams.get("query") || url.searchParams.get("destination");
      if (query) return decodeURIComponent(query.replace(/\+/g, " "));
      const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/i);
      if (placeMatch?.[1]) return decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
      return text;
    } catch {
      return text;
    }
  }
  return text;
}

function clipboardCoordinates(value: string) {
  const match = value.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (match) return `${match[1]}, ${match[2]}`;
  const plusCode = extractPlusCode(value);
  const decoded = plusCode ? decodePlusCode(plusCode) : null;
  return decoded ? `${decoded.lat}, ${decoded.lng}` : null;
}
const toDraft = (restaurant: Restaurant): RestaurantDraft => ({
  name: restaurant.name,
  address_raw: restaurant.address_raw || "",
  category: restaurant.category || "",
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
  "w-full rounded-xl border border-[#402c1e]/15 bg-white/60 px-3 py-2.5 text-base text-[#402c1e] outline-none placeholder:text-[#8a7360] focus:border-[#a35e2d] dark:border-[#f7eadc]/15 dark:bg-[#1c130d]/40 dark:text-[#f7eadc] md:text-[14px]";

const normalizeWardKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/^(phuong|xa)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function matchesSearchQuery(values: Array<string | null | undefined>, query: string) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!tokens.length) return true;
  const haystack = normalizeSearchText(values.filter(Boolean).join(" "));
  return tokens.every((token) => haystack.includes(token));
}

function findWard(wardName: string | null, wards: Ward[]) {
  if (!wardName) return null;
  const key = normalizeWardKey(wardName);
  return (
    wards.find(
      (ward) =>
        normalizeWardKey(ward.name) === key ||
        ward.old_names?.some((name) => normalizeWardKey(name) === key),
    ) || null
  );
}

function addressAlreadyIncludesWard(address: string, ward?: string) {
  return ward
    ? normalizeWardKey(address).includes(normalizeWardKey(ward))
    : false;
}

function displayWardName(ward: Ward | null | undefined) {
  if (!ward) return null;
  const prefix = ward.type === "xa" ? "Xã" : "Phường";
  const bareName = ward.name.replace(/^(phường|phuong|xã|xa)\s+/i, "").trim();
  return `${prefix} ${bareName}`;
}

function displayAddress(address: string, wardName?: string | null) {
  if (!wardName) return address;
  return address
    .replace(/,?\s*(?:hà nội|ha noi|việt nam|viet nam)\b/giu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*$/g, "")
    .trim();
}

function findWardFromAddress(addressRaw: string | null | undefined, wards: Ward[]) {
  const address = normalizeWardKey(addressRaw || "");
  if (!address) return null;
  return wards.find((candidate) =>
    [candidate.name, ...(candidate.old_names || [])].some((name) => {
      const alias = normalizeWardKey(name);
      return alias.length >= 3 && address.includes(alias);
    }),
  ) || null;
}

function wardForRestaurant(restaurant: Restaurant, wards: Ward[]) {
  return restaurant.admin_wards || findWardFromAddress(restaurant.address_raw, wards);
}

function useSwipeToClose(onSwipe: () => void) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const begin = (x: number, y: number) => {
    touchStart.current = { x, y };
  };
  const finish = (x: number, y: number) => {
    if (!touchStart.current) return;
    const deltaX = x - touchStart.current.x;
    const deltaY = Math.abs(y - touchStart.current.y);
    touchStart.current = null;
    // Either horizontal direction is accepted. This keeps the requested
    // left-swipe behavior while also matching iOS users' right-swipe habit.
    if (Math.abs(deltaX) >= 64 && deltaY < 72) onSwipe();
  };
  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType === "touch") begin(event.clientX, event.clientY);
    },
    onPointerUp: (event: React.PointerEvent) => {
      if (event.pointerType === "touch") finish(event.clientX, event.clientY);
    },
    onPointerCancel: () => {
      touchStart.current = null;
    },
    onTouchStart: (event: React.TouchEvent) => {
      if ("PointerEvent" in window) return;
      const touch = event.changedTouches[0];
      begin(touch.clientX, touch.clientY);
    },
    onTouchEnd: (event: React.TouchEvent) => {
      if ("PointerEvent" in window) return;
      const touch = event.changedTouches[0];
      finish(touch.clientX, touch.clientY);
    },
  };
}

function useBottomSheetDismiss(onDismiss: () => void) {
  const startY = useRef<number | null>(null);
  const dismissed = useRef(false);
  const dismissIfDragged = (currentY: number) => {
    if (dismissed.current || startY.current == null) return;
    if (currentY - startY.current > 72) {
      dismissed.current = true;
      onDismiss();
    }
  };
  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType === "touch") {
        startY.current = event.clientY;
        dismissed.current = false;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (event.pointerType === "touch") dismissIfDragged(event.clientY);
    },
    onPointerUp: () => {
      startY.current = null;
      dismissed.current = false;
    },
    onPointerCancel: () => { startY.current = null; },
    onTouchStart: (event: React.TouchEvent) => {
      startY.current = event.touches[0]?.clientY ?? null;
      dismissed.current = false;
    },
    onTouchMove: (event: React.TouchEvent) => {
      const currentY = event.touches[0]?.clientY;
      if (currentY != null) dismissIfDragged(currentY);
    },
    onTouchEnd: () => { startY.current = null; dismissed.current = false; },
  };
}

function useModalBodyLock(enabled = true) {
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
    // Fixed-body locking also works on iOS Safari, where overflow:hidden on
    // body alone still allows the document behind a bottom sheet to move.
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
  estimatedDistance,
  roadRoute,
  travelMode = "two-wheeler",
  onOpen,
  onQuickLog,
  ward,
}: {
  restaurant: Restaurant;
  airDistance?: number;
  estimatedDistance?: number;
  roadRoute?: RoadRoute;
  travelMode?: TravelMode;
  onOpen: () => void;
  onQuickLog?: () => void;
  ward?: Ward | null;
}) {
  const wardName = displayWardName(ward || restaurant.admin_wards);
  const addressLabel = restaurant.address_raw
    ? displayAddress(restaurant.address_raw, wardName)
    : null;
  return (
    <article className="glass animate-rise mb-3 rounded-[22px] p-4 pt-5 transition hover:-translate-y-0.5">
      <button
        onClick={onOpen}
        className="flex w-full items-start gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-bold leading-snug text-[#402c1e] dark:text-[#f7eadc]">
            {restaurant.name}
          </h2>
          {addressLabel && (
            <p className="mt-1 text-[13px] leading-relaxed text-[#6b5644] dark:text-[#cbb4a0]">
              {addressLabel}
              {wardName &&
                !addressAlreadyIncludesWard(addressLabel, wardName) &&
                ` · ${wardName}`}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={restaurant.status} />
            <TasteBadge taste={restaurant.taste_rating} />
            <CategoryBadge category={restaurant.category} />
          </div>
        </div>
        {roadRoute ? (
          <div className="min-w-[72px] rounded-2xl bg-gradient-to-br from-[#a35e2d] to-[#e5a36a] px-2.5 py-2 text-center text-white shadow-sm">
            <span className="block text-[18px] font-extrabold leading-none">
              {formatDistance(roadRoute.distanceKm)}
            </span>
            <span className="mt-1 block text-[10px] font-bold leading-none opacity-90">
              {roadRoute.isEstimated ? "ước tính" : ""}
            </span>
            {airDistance != null && (
              <span className="mt-1.5 flex items-center justify-center gap-1 text-[9px] font-medium leading-none opacity-80">
                <Bird size={10} /> {formatDistance(airDistance)}
              </span>
            )}
          </div>
        ) : estimatedDistance != null ? (
          <div className="min-w-[72px] rounded-2xl bg-[#402c1e]/7 px-2.5 py-2 text-center text-[#402c1e] dark:bg-[#f7eadc]/10 dark:text-[#f7eadc]">
            <span className="block text-[15px] font-extrabold leading-none">
              {formatDistance(estimatedDistance)}
            </span>
            <span className="mt-1 block text-[10px] font-bold leading-none opacity-75">
              ước tính
            </span>
            {airDistance != null && (
              <span className="mt-1.5 flex items-center justify-center gap-1 text-[9px] font-medium leading-none opacity-65">
                <Bird size={10} /> {formatDistance(airDistance)}
              </span>
            )}
          </div>
        ) : (
          <ChevronRight size={18} className="mt-2 text-[#a35e2d]" />
        )}
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {onQuickLog && (
          <button
            type="button"
            onClick={onQuickLog}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#a35e2d] py-2 text-[12px] font-extrabold text-white transition active:scale-[.98]"
          >
            <Check size={14} strokeWidth={3} />
            Check-in
          </button>
        )}
        <a
          href={directionsUrl(restaurant, travelMode)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={`flex items-center justify-center gap-1.5 rounded-xl bg-[#402c1e]/7 py-2 text-[12px] font-bold text-[#402c1e] transition hover:bg-[#402c1e]/10 dark:bg-[#f7eadc]/10 dark:text-[#f7eadc] ${onQuickLog ? "" : "col-span-2"}`}
        >
          <Navigation size={14} strokeWidth={2.5} />
          Chỉ đường
        </a>
      </div>
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
  categories,
  adminWards,
  clipboardText,
  onClose,
  onSaved,
}: {
  restaurant: Restaurant | null;
  restaurants: Restaurant[];
  categories: string[];
  adminWards: Ward[];
  clipboardText: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<RestaurantDraft>(
    restaurant ? toDraft(restaurant) : emptyDraft(),
  );
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clipboardReading, setClipboardReading] = useState(false);
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null);
  const swipeHandlers = useSwipeToClose(onClose);
  useModalBodyLock();
  const candidates = useMemo(
    () => similarRestaurants(draft, restaurants, restaurant?.id),
    [draft, restaurants, restaurant?.id],
  );
  const set = <K extends keyof RestaurantDraft>(
    key: K,
    value: RestaurantDraft[K],
  ) => setDraft((state) => ({ ...state, [key]: value }));
  const clipboardAddress = clipboardText ? clipboardAddressSuggestion(clipboardText) : null;
  const applyClipboard = (value: string) => {
    const address = clipboardAddressSuggestion(value);
    if (!address) {
      setClipboardMessage("Clipboard chưa có địa chỉ Hà Nội hoặc link Google Maps.");
      return;
    }
    set("address_raw", address);
    const coordinates = clipboardCoordinates(value);
    if (coordinates) set("coordinates", coordinates);
    setClipboardMessage(coordinates ? "Đã dán địa chỉ và tọa độ." : "Đã dán địa chỉ từ Google Maps.");
  };
  const readClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      setClipboardMessage("Trình duyệt không cho phép đọc clipboard. Hãy dán thủ công.");
      return;
    }
    setClipboardReading(true);
    setClipboardMessage(null);
    try {
      applyClipboard(await navigator.clipboard.readText());
    } catch {
      setClipboardMessage("Chưa được cấp quyền đọc clipboard. Hãy bấm lại hoặc dán thủ công.");
    } finally {
      setClipboardReading(false);
    }
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase)
      return setError(
        "Chưa có kết nối Supabase. Hãy thêm biến môi trường trước khi lưu.",
      );
    if (!draft.name.trim()) return setError("Tên quán là mục bắt buộc.");
    if (!draft.category) return setError("Hãy chọn nhóm món.");
    const coordinates = draft.coordinates
      .trim()
      .match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    const addressChanged =
      draft.address_raw.trim() !== (restaurant?.address_raw || "").trim();
    const shouldGeocode = Boolean(
      !coordinates &&
        draft.address_raw.trim() &&
        (!restaurant || addressChanged || restaurant.lat == null || restaurant.lng == null),
    );
    setSaving(true);
    setError(null);
    let geocoded: GeocodeResult | null = null;
    if (shouldGeocode) {
      try {
        const response = await fetch(
          `/api/geocode?name=${encodeURIComponent(draft.name)}&address=${encodeURIComponent(draft.address_raw)}`,
        );
        const body = (await response.json()) as {
          result?: GeocodeResult | null;
        };
        geocoded = body.result || null;
      } catch {
        geocoded = null;
      }
    }
    const matchedWard =
      findWard(geocoded?.wardName || null, adminWards) ||
      findWardFromAddress(
        [draft.address_raw, geocoded?.formattedAddress].filter(Boolean).join(", "),
        adminWards,
      );
    const payload = {
      name: draft.name.trim(),
      address_raw:
        geocoded?.formattedAddress || draft.address_raw.trim() || null,
      category: draft.category || null,
      notes: draft.notes.trim() || null,
      status: draft.status,
      taste_rating:
        draft.status === "da_den" ? draft.taste_rating || null : null,
      lat: coordinates
        ? Number(coordinates[1])
        : geocoded?.lat ?? (shouldGeocode ? null : (restaurant?.lat ?? null)),
      lng: coordinates
        ? Number(coordinates[2])
        : geocoded?.lng ?? (shouldGeocode ? null : (restaurant?.lng ?? null)),
      geocode_source: coordinates
        ? "manual"
        : geocoded
          ? geocoded.source || "nominatim"
          : shouldGeocode
            ? "unset"
            : restaurant?.geocode_source || "unset",
      geocode_confidence: coordinates
        ? "manual"
        : geocoded?.confidence ||
          (shouldGeocode ? "low" : restaurant?.geocode_confidence || "low"),
      ward_id:
        matchedWard?.id ||
        (shouldGeocode ? null : restaurant?.ward_id || null),
    };
    const query = restaurant
      ? supabase
          .from("restaurants")
          .update(payload)
          .eq("id", restaurant.id)
          .select("id")
      : supabase.from("restaurants").insert(payload).select().single();
    const { error: saveError } = await query;
    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }
    await onSaved();
    setSaving(false);
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-[#1c130d]/35 p-0 backdrop-blur-sm md:items-center md:p-6">
      <div
        {...swipeHandlers}
        className="h-[100dvh] max-h-[100dvh] w-full max-w-xl touch-pan-y overflow-y-auto overscroll-contain bg-[#fbf3ea] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl dark:bg-[#281b13] md:h-auto md:max-h-[92dvh] md:rounded-[20px] md:p-5"
      >
        <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex items-center justify-between border-b border-[#402c1e]/8 bg-[#fbf3ea]/95 px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-xl dark:bg-[#281b13]/95 md:static md:mx-0 md:mt-0 md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0 md:backdrop-blur-none">
          <div>
            <p className="mb-1 text-[10px] font-bold text-[#8a7360] md:hidden">
              Vuốt ngang để quay lại
            </p>
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
              placeholder="Nhập tên quán"
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
              Sau khi lưu, app sẽ chuẩn hoá địa chỉ và tự gắn phường khi dữ liệu OSM xác định được.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={readClipboard}
                disabled={clipboardReading}
                className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#e5a36a]/25 px-3 py-1.5 text-left text-[11px] font-bold text-[#70421f] dark:text-[#f6d3aa]"
              >
                <ClipboardPaste size={13} className="shrink-0" />
                <span className="truncate">{clipboardReading ? "Đang đọc clipboard…" : "Đọc clipboard / Dán nhanh"}</span>
              </button>
              {clipboardAddress && (
                <button
                  type="button"
                  onClick={() => applyClipboard(clipboardText || "")}
                  className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#a35e2d]/12 px-3 py-1.5 text-left text-[11px] font-bold text-[#7f421e] dark:text-[#f1c496]"
                >
                  Dùng nội dung đã phát hiện
                </button>
              )}
            </div>
            {clipboardMessage && <p className="mt-1 text-[11px] font-semibold text-[#a35e2d]">{clipboardMessage}</p>}
          </Field>
          <Field label="Nhóm món *">
            <input
              required
              value={draft.category}
              onChange={(event) => set("category", event.target.value)}
              list="restaurant-categories"
              className={inputClass}
              placeholder="Chọn hoặc gõ nhóm món mới"
            />
            <datalist id="restaurant-categories">
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </datalist>
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
  onClearVisits,
  travelMode,
  ward,
  isAdmin,
}: {
  restaurant: Restaurant;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (status: Status) => Promise<void>;
  onTaste: (taste: "ngon" | "khong_ngon" | null) => Promise<void>;
  onClearVisits: () => Promise<boolean>;
  travelMode: TravelMode;
  ward?: Ward | null;
  isAdmin: boolean;
}) {
  const [updating, setUpdating] = useState(false);
  const [visits, setVisits] = useState<VisitLog[]>([]);
  const sheetDismissHandlers = useBottomSheetDismiss(onClose);
  useModalBodyLock();
  const detailWardName = displayWardName(ward || restaurant.admin_wards);
  const detailAddress = restaurant.address_raw
    ? displayAddress(restaurant.address_raw, detailWardName)
    : null;
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("visit_logs")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("visited_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setVisits((data || []) as VisitLog[]));
  }, [restaurant.id]);
  const update = async (task: () => Promise<void>) => {
    setUpdating(true);
    await task();
    setUpdating(false);
  };
  const clearVisitHistory = async () => {
    if (!visits.length || !window.confirm(`Xóa toàn bộ ${visits.length} lần check-in của “${restaurant.name}”?`)) return;
    setUpdating(true);
    if (await onClearVisits()) setVisits([]);
    setUpdating(false);
  };
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#140e0a]/35 backdrop-blur-sm md:justify-end">
      <aside
          onTouchMove={(event) => event.stopPropagation()}
          className="isolate h-[88dvh] w-full max-w-xl touch-pan-y overscroll-contain overflow-y-auto rounded-t-[30px] bg-[#fbf3ea] px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl dark:bg-[#281b13] md:h-full md:rounded-none md:py-6"
      >
        <div
          {...sheetDismissHandlers}
          className="mx-auto mb-3 flex w-full touch-none cursor-grab flex-col items-center justify-center gap-1.5 py-1 md:hidden"
          aria-label="Vuốt xuống để đóng"
        >
          <span className="h-2 w-16 rounded-full bg-[#a35e2d]/60 shadow-sm dark:bg-[#e5a36a]/65" />
          <span className="text-[10px] font-bold text-[#8a7360]">Kéo xuống để đóng</span>
        </div>
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center gap-1 rounded-xl bg-[#402c1e]/8 px-3 py-2 text-sm font-bold"
          >
            <ChevronLeft size={18} />
            Quay lại
          </button>
          {isAdmin && <div className="flex gap-2">
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
          </div>}
        </div>
        <p className="mb-3 text-[10px] font-bold text-[#8a7360] md:hidden">
          Kéo thanh phía trên xuống để đóng
        </p>
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
            {detailAddress || "Chưa có địa chỉ"}
            {detailWardName &&
              detailAddress &&
              !addressAlreadyIncludesWard(
                detailAddress,
                detailWardName,
              ) && (
              <>
                <br />
                {detailWardName}
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
        <section className="mt-7">
          <div className="flex items-center justify-between">
            <SectionTitle>Lịch sử ghé quán</SectionTitle>
            {visits.length > 0 && (
              <button
                type="button"
                onClick={clearVisitHistory}
                className="mb-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-red-800/75 hover:bg-red-900/8 dark:text-red-200/80"
              >
                <Trash2 size={13} /> Xóa lịch sử
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#402c1e]/8 bg-white/35 dark:bg-black/10">
            {visits.length ? visits.map((visit) => (
              <div key={visit.id} className="flex items-center justify-between border-b border-[#402c1e]/8 px-3 py-3 last:border-0">
                <div><p className="text-sm font-bold">{visit.visited_at}</p>{visit.note && <p className="mt-0.5 text-xs text-[#8a7360]">{visit.note}</p>}</div>
                {visit.taste_rating && <TasteBadge taste={visit.taste_rating} />}
              </div>
            )) : <p className="px-3 py-5 text-sm text-[#8a7360]">Chưa có lần ghé nào được ghi lại.</p>}
          </div>
        </section>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold">Tổng quan vị trí</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#8a7360]">
            Theo dõi chất lượng dữ liệu ghim quán. Những dòng chưa kiểm chứng sẽ
            không dùng tọa độ cho chỉ đường.
          </p>
        </div>
        <div className="relative self-end sm:self-auto">
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
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [adminWards, setAdminWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [routingPosition, setRoutingPosition] = useState<Position | null>(null);
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
  const [categoryFilterSearch, setCategoryFilterSearch] = useState("");
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [ward, setWard] = useState("all");
  const [quickFilter, setQuickFilter] = useState<QuickContext>("all");
  const [wardPickerOpen, setWardPickerOpen] = useState(false);
  const [clipboardText, setClipboardText] = useState<string | null>(null);
  const [quickLoggingId, setQuickLoggingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [formTarget, setFormTarget] = useState<Restaurant | null | undefined>(
    undefined,
  );
  const [toast, setToast] = useState<string | null>(null);
  const locationWatchRef = useRef<number | null>(null);
  const roadRoutesRef = useRef<Record<string, RoadRoute>>({});
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  };
  const switchTab = (nextTab: Tab) => {
    if (nextTab === tab) return;
    setSearch("");
    setSearchQuery("");
    setStatus("all");
    setCategory("all");
    setCategoryFilterSearch("");
    setShowAllCategories(false);
    setWard("all");
    setQuickFilter("all");
    setWardPickerOpen(false);
    setTab(nextTab);
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
    const [restaurantResult, wardResult, collectionResult] = await Promise.all([
      supabase
        .from("restaurants")
        .select("*, admin_wards(*)")
        .order("created_at", { ascending: false }),
      supabase.from("admin_wards").select("*").order("name"),
      supabase.from("collections").select("*").order("sort_order"),
    ]);
    if (restaurantResult.error)
      setLoadError(
        `Không thể kết nối dữ liệu (${restaurantResult.error.message}). Hãy thử tải lại.`,
      );
    else {
      setRestaurants(restaurantResult.data as Restaurant[]);
      setLoadError(null);
    }
    if (!wardResult.error) setAdminWards(wardResult.data as Ward[]);
    if (!collectionResult.error) {
      const nextCollections = collectionResult.data as Collection[];
      setCollections(nextCollections);
      setSelectedCollectionIds((current) => current.length ? current.filter((id) => nextCollections.some((item) => item.id === id)) : nextCollections.map((item) => item.id));
    }
    setLoading(false);
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    const stored = window.localStorage.getItem("prot-food-collections-v1");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) setSelectedCollectionIds(parsed);
      } catch {
        /* Ignore invalid local storage. */
      }
    }
    const params = new URLSearchParams(window.location.search);
    const adminParam = params.get("admin");
    if (window.localStorage.getItem("prot-food-admin-v1") === "1") setIsAdmin(true);
    if (adminParam) void loginWithPin(adminParam, true);
  }, []);
  const chooseCollections = (ids: string[]) => {
    setSelectedCollectionIds(ids);
    window.localStorage.setItem("prot-food-collections-v1", JSON.stringify(ids));
  };
  const loginWithPin = async (inputPin?: string, fromBookmark = false) => {
    const pin = inputPin || window.prompt("Nhập mã PIN Quản trị viên (6 số):");
    if (!pin) return;
    const response = await fetch("/api/admin/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    if (response.ok) { setIsAdmin(true); window.localStorage.setItem("prot-food-admin-v1", "1"); notify(fromBookmark ? "Đã kích hoạt Admin từ bookmark." : "Đã mở khóa quyền Admin thành công!"); }
    else notify("Mã PIN không chính xác hoặc chưa cấu hình.");
  };
  const signOutAdmin = async () => {
    window.localStorage.removeItem("prot-food-admin-v1");
    setIsAdmin(false);
    notify("Đã đăng xuất quản trị.");
  };
  useEffect(() => {
    if (!navigator.clipboard?.readText) return;
    navigator.clipboard
      .readText()
      .then((value) => setClipboardText(clipboardAddressSuggestion(value) ? value : null))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const savedMode = window.localStorage.getItem("prot-food-travel-mode");
    if (savedMode === "two-wheeler" || savedMode === "driving")
      setTravelMode(savedMode);
  }, []);
  useEffect(() => {
    if (!search) {
      setSearchQuery("");
      return;
    }
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
    if (tab !== "nearby" && tab !== "roulette") return;
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
  const visibleCategories = useMemo(() => {
    const query = normalizeSearchText(categoryFilterSearch);
    const matching = query
      ? categories.filter((value) => normalizeSearchText(value).includes(query))
      : categories;
    const limited = showAllCategories || query ? matching : matching.slice(0, 8);
    if (category !== "all" && !limited.includes(category)) return [category, ...limited];
    return limited;
  }, [categories, category, categoryFilterSearch, showAllCategories]);
  const filtered = useMemo(
    () =>
      restaurants.filter((item) => {
        const resolvedWard = wardForRestaurant(item, adminWards);
        return (
          (selectedCollectionIds.length === 0 || selectedCollectionIds.includes(item.collection_id || "prot_food")) &&
          matchesSearchQuery(
            [
              item.name,
              item.address_raw,
              item.notes,
              item.shop_note,
              resolvedWard?.name,
              displayWardName(resolvedWard),
            ],
            searchQuery,
          ) &&
          (status === "all" || item.status === status) &&
          (category === "all" || item.category === category) &&
          (ward === "all" || resolvedWard?.name === ward)
        );
      }),
    [restaurants, adminWards, selectedCollectionIds, searchQuery, status, category, ward],
  );
  const contextFiltered = useMemo(
    () =>
      filtered.filter((item) => {
        if (quickFilter === "favorite") return item.taste_rating === "ngon";
        if (quickFilter === "untried") return item.status === "muon_den";
        if (quickFilter === "stale") {
          if (!item.last_visited_at) return false;
          return Date.now() - new Date(`${item.last_visited_at}T00:00:00`).getTime() > 90 * 86_400_000;
        }
        if (quickFilter === "nearest") return true;
        return true;
      }),
    [filtered, position, quickFilter],
  );
  const nearbyByAir = useMemo(
    () =>
      contextFiltered
        .map((item) => ({
          item,
          airDistance:
            position &&
            item.lat != null &&
            item.lng != null
              ? haversineKm(position.lat, position.lng, item.lat, item.lng)
              : undefined,
          estimatedDistance:
            position && item.lat != null && item.lng != null
              ? smartEstimatedDistanceKm(position, { lat: item.lat, lng: item.lng })
              : undefined,
        }))
        .sort(
          (a, b) =>
            (a.estimatedDistance ?? Infinity) -
              (b.estimatedDistance ?? Infinity) ||
            a.item.id.localeCompare(b.item.id),
        ),
    [contextFiltered, position],
  );
  const routeCandidateKey = useMemo(
    () =>
      nearbyByAir
        .filter(({ item, estimatedDistance }) =>
          estimatedDistance != null && isRouteEligible(item),
        )
        .slice(0, ROUTE_CANDIDATE_LIMIT)
        .map(({ item }) => item.id)
        .join(","),
    [nearbyByAir],
  );
  const routeCandidates = useMemo(
    () => {
      const restaurantsById = new Map(restaurants.map((item) => [item.id, item]));
      return routeCandidateKey
        .split(",")
        .filter(Boolean)
        .map((id) => {
          const item = restaurantsById.get(id);
          return item && item.lat != null && item.lng != null
            ? { id: item.id, lat: item.lat, lng: item.lng }
            : null;
        })
        .filter(
          (item): item is { id: string; lat: number; lng: number } => item != null,
        );
    },
    [restaurants, routeCandidateKey],
  );
  useEffect(() => {
    if (tab !== "nearby" || !position) {
      setRoutingPosition(null);
      return;
    }

    if (!routingPosition) {
      setRoutingPosition(position);
      return;
    }

    if (
      haversineKm(
        routingPosition.lat,
        routingPosition.lng,
        position.lat,
        position.lng,
      ) < ROUTE_RECALCULATION_DISTANCE_KM
    ) {
      return;
    }

    const timer = window.setTimeout(
      () => setRoutingPosition(position),
      ROUTE_RECALCULATION_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [position, routingPosition, tab]);
  useEffect(() => {
    if (tab !== "nearby" || !routingPosition || !routeCandidates.length) {
      setRoutingState("idle");
      return;
    }
    const cacheKey = routeCacheKey(routingPosition);
    const cachedRaw = window.localStorage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as RouteCache;
        roadRoutesRef.current = cached.routes;
        setRoadRoutes(cached.routes);
        setRoutingState("ready");
        if (Date.now() - cached.savedAt < ROUTE_CACHE_MS) {
          return;
        }
      } catch {
        window.localStorage.removeItem(cacheKey);
      }
    }

    const controller = new AbortController();
    setRoutingState("loading");
    (async () => {
      try {
        const response = await fetch("/api/routing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin: routingPosition, destinations: routeCandidates }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Routing không phản hồi");
        const data = (await response.json()) as {
          distances: Record<string, number | null>;
          isEstimated?: boolean;
        };
        const routes: Record<string, RoadRoute> = {};
        for (const [id, meters] of Object.entries(data.distances)) {
          if (typeof meters === "number" && meters > 0)
            routes[id] = {
              distanceKm: meters / 1000,
              isEstimated: data.isEstimated,
            };
        }
        if (!controller.signal.aborted) {
          roadRoutesRef.current = routes;
          setRoadRoutes(routes);
          setRoutingState("ready");
          window.localStorage.setItem(
            cacheKey,
            JSON.stringify({ savedAt: Date.now(), routes } satisfies RouteCache),
          );
        }
      } catch {
        if (!controller.signal.aborted) {
          setRoutingState((current) =>
            Object.keys(roadRoutesRef.current).length > 0 || current === "ready"
              ? "ready"
              : "unavailable",
          );
        }
      }
    })();
    return () => controller.abort();
  }, [tab, routingPosition, routeCandidateKey, routeCandidates]);
  const nearby = useMemo(
    () =>
      nearbyByAir
        .map(({ item, airDistance, estimatedDistance }) => ({
          item,
          airDistance,
          estimatedDistance,
          roadRoute: position ? roadRoutes[item.id] : undefined,
        }))
        .filter(({ roadRoute, estimatedDistance }) => quickFilter !== "nearest" || Boolean(roadRoute && roadRoute.distanceKm < 1.5) || (!position && estimatedDistance != null && estimatedDistance < 1.5))
        .sort(
          (a, b) =>
            (a.roadRoute?.distanceKm ?? a.estimatedDistance ?? Infinity) -
              (b.roadRoute?.distanceKm ?? b.estimatedDistance ?? Infinity) ||
            (a.estimatedDistance ?? Infinity) -
              (b.estimatedDistance ?? Infinity) ||
            a.item.id.localeCompare(b.item.id),
        ),
    [nearbyByAir, position, roadRoutes, quickFilter],
  );
  const visited = restaurants.filter((item) => item.status === "da_den");
  const good = visited.filter((item) => item.taste_rating === "ngon");
  const bad = visited.filter((item) => item.taste_rating === "khong_ngon");
  const wardOptions = useMemo(() => {
    const counts = new Map<string, number>();
    restaurants.forEach((item) => {
      const name = wardForRestaurant(item, adminWards)?.name;
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts, ([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [restaurants, adminWards]);
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
  async function quickLogRestaurant(restaurant: Restaurant) {
    if (!supabase || quickLoggingId) return;
    setQuickLoggingId(restaurant.id);
    const { error } = await supabase.from("visit_logs").insert({
      restaurant_id: restaurant.id,
      visited_at: new Date().toISOString().slice(0, 10),
      taste_rating: restaurant.taste_rating || null,
      price_level: restaurant.price_level || null,
    });
    if (error) {
      notify(error.message);
    } else {
      navigator.vibrate?.(15);
      await refresh();
      notify(`Đã check-in ${restaurant.name}.`);
    }
    setQuickLoggingId(null);
  }
  async function clearVisitHistory(restaurant: Restaurant) {
    if (!supabase) return false;
    const { error: deleteError } = await supabase
      .from("visit_logs")
      .delete()
      .eq("restaurant_id", restaurant.id);
    if (deleteError) {
      notify(deleteError.message);
      return false;
    }
    const { error: resetError } = await supabase
      .from("restaurants")
      .update({
        status: "muon_den",
        last_visited_at: null,
        visit_count: 0,
        taste_rating: null,
        price_level: null,
      })
      .eq("id", restaurant.id);
    if (resetError) {
      notify(resetError.message);
      return false;
    }
    await refresh();
    setSelected({
      ...restaurant,
      status: "muon_den",
      last_visited_at: null,
      visit_count: 0,
      taste_rating: null,
      price_level: null,
    });
    notify("Đã xóa lịch sử check-in.");
    return true;
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
      <div className="mb-2 flex max-w-full items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-[#402c1e]/10 bg-white/40 px-2.5 py-2 dark:bg-black/10">
          <Search size={14} className="shrink-0 text-[#a35e2d]" />
          <input
            value={categoryFilterSearch}
            onChange={(event) => {
              const next = event.target.value;
              if (!next && categoryFilterSearch) setCategory("all");
              setCategoryFilterSearch(next);
            }}
            placeholder="Tìm nhóm món…"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#8a7360] md:text-xs"
          />
          {(categoryFilterSearch || category !== "all") && (
            <button
              type="button"
              onClick={() => {
                setCategoryFilterSearch("");
                setCategory("all");
              }}
              className="rounded-full p-1 text-[#8a7360]"
              aria-label="Xóa tìm kiếm và bộ lọc nhóm món"
            >
              <X size={15} />
            </button>
          )}
        </label>
        {categories.length > 8 && (
          <button
            type="button"
            onClick={() => setShowAllCategories((value) => !value)}
            className="shrink-0 rounded-xl bg-[#402c1e]/7 px-2.5 py-2 text-xs font-bold text-[#402c1e] dark:bg-white/10 dark:text-[#f7eadc]"
          >
            {showAllCategories ? "Thu gọn" : `+${categories.length - 8}`}
          </button>
        )}
      </div>
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
        <Chip active={category === "all"} onClick={() => setCategory("all")}>
          Tất cả
        </Chip>
        {visibleCategories.map((value) => (
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
          <button
            type="button"
            onClick={() => setWardPickerOpen(true)}
            className="flex w-full items-center justify-between rounded-xl border border-[#402c1e]/15 bg-white/60 px-3 py-2.5 text-left text-sm font-bold text-[#402c1e] dark:border-[#f7eadc]/15 dark:bg-[#1c130d]/40 dark:text-[#f7eadc]"
          >
            <span>{ward === "all" ? "Tất cả phường / xã có quán" : ward}</span>
            <Search size={16} className="text-[#a35e2d]" />
          </button>
        </>
      )}
    </>
  );
  const navItems = [
    { id: "nearby" as const, label: "Gần đây", icon: Compass },
    { id: "profile" as const, label: "Thống kê", icon: Flame },
    { id: "roulette" as const, label: collections.length && selectedCollectionIds.length && selectedCollectionIds.every((id) => collections.find((item) => item.id === id)?.type === "cafe") ? "Uống gì?" : "Ăn gì?", icon: Dices },
    { id: "settings" as const, label: "Cài đặt", icon: Settings },
  ];
  const pageTitle =
    tab === "nearby"
      ? "Gần đây"
        : tab === "profile"
          ? "Thống kê"
        : tab === "roulette"
          ? collections.length && selectedCollectionIds.length && selectedCollectionIds.every((id) => collections.find((item) => item.id === id)?.type === "cafe") ? "Hôm nay uống gì?" : "Hôm nay ăn gì?"
        : tab === "settings"
          ? "Cài đặt"
          : "";
  const pageSubtitle =
    tab === "nearby"
      ? "Quán quanh vị trí hiện tại của bạn"
        : tab === "profile"
        ? `${restaurants.length} quán · ${visited.length} đã đến`
        : tab === "roulette"
          ? "Một gợi ý hợp thời điểm, hợp vị trí"
        : tab === "settings"
          ? "Quyền truy cập, nguồn dữ liệu và tùy chọn thiết bị"
          : "";
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
                onClick={() => switchTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold ${tab === item.id ? "bg-[#402c1e] text-[#fbf3ea]" : "text-[#6b5644] dark:text-[#cbb4a0]"}`}
              >
                <item.icon size={19} />
                {item.label}
              </button>
            ))}
          </nav>
          {isAdmin && <button
              type="button"
              onClick={() => setFormTarget(null)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#a35e2d] px-3 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#a35e2d]/20"
            >
              <Plus size={18} />
              Thêm quán mới
            </button>}
          <p className="mt-auto px-3 text-xs leading-relaxed text-[#8a7360]">
            PWA cá nhân · không có bản đồ trong app.<br />v3.2.0
          </p>
        </aside>
        <section className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 md:px-10 md:pb-10">
          <header className="mb-5">
            <p className="text-[11px] font-extrabold tracking-[0.18em] text-[#a35e2d] md:hidden">
              PROT FOOD · v3.2.0
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
                      “Đường đi” ưu tiên dữ liệu OSM; khi dịch vụ bận, ứng dụng tự ước tính đường vòng qua sông hồ và không gồm kẹt xe.
                    </p>
                  </>
                )}
                {!position && wardOptions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setWardPickerOpen(true)}
                    className="mt-3 flex w-full items-center justify-between rounded-xl bg-[#402c1e]/6 px-3 py-2.5 text-left text-xs font-bold dark:bg-white/8"
                  >
                    <span>{ward === "all" ? "Hoặc chọn phường / xã để lọc gần đúng" : ward}</span>
                    <Search size={15} className="text-[#a35e2d]" />
                  </button>
                )}
              </div>
              <SectionTitle>Lọc theo ngữ cảnh</SectionTitle>
              <QuickContextFilter value={quickFilter} onChange={setQuickFilter} />
              <SectionTitle>Bộ lọc cơ bản</SectionTitle>
              {filterRow()}
              <div className="mt-4">
                {loading || (!position && !locationError) ? (
                  <Loading />
                ) : nearby.length ? (
                  nearby.map(({ item, airDistance, estimatedDistance, roadRoute }) => (
                    <RestaurantCard
                      key={item.id}
                      restaurant={item}
                      airDistance={airDistance}
                      estimatedDistance={estimatedDistance}
                      roadRoute={roadRoute}
                      travelMode={travelMode}
                      ward={wardForRestaurant(item, adminWards)}
                      onOpen={() => setSelected(item)}
                      onQuickLog={() => quickLogRestaurant(item)}
                    />
                  ))
                ) : (
                  <Empty text="Chưa có quán nào khớp bộ lọc." />
                )}
              </div>
            </div>
          )}
          {tab === "settings" && (
            <div>
              <div className="glass mb-4 flex items-center gap-2 rounded-2xl px-4 py-3">
                <Search size={18} className="shrink-0 text-[#a35e2d]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm quán, địa chỉ, ghi chú…"
                  className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#8a7360] md:text-sm"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setSearchQuery("");
                    }}
                    className="rounded-full p-1 text-[#8a7360]"
                    aria-label="Xóa tìm kiếm quán"
                  >
                    <X size={16} />
                  </button>
                )}
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
                      ward={wardForRestaurant(item, adminWards)}
                      onOpen={() => setSelected(item)}
                      onQuickLog={() => quickLogRestaurant(item)}
                    />
                  ))
                ) : (
                  <Empty text="Không tìm thấy quán nào khớp bộ lọc." />
                )}
              </div>
            </div>
          )}
          {tab === "settings" && (
            <div className="space-y-4">
              <section className={`rounded-[20px] border p-4 ${isAdmin ? "border-[#a35e2d]/45 bg-[#a35e2d]/12" : "border-[#402c1e]/12 bg-white/45 dark:bg-black/10"}`}>
                <p className="text-sm font-extrabold">{isAdmin ? "👑 Bạn đang là Admin Prot" : "👀 Bạn đang ở chế độ Viewer"}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#8a7360]">{isAdmin ? "Bạn có thể thêm quán, sửa/xóa dữ liệu và nạp nguồn Excel hoặc Google Sheets." : "Bạn có thể tìm, xem chỉ đường và quay Roulette. Các nút quản trị được ẩn."}</p>
                <button type="button" onClick={isAdmin ? signOutAdmin : () => void loginWithPin()} className="mt-3 rounded-xl bg-[#402c1e] px-3 py-2 text-xs font-bold text-white">{isAdmin ? "Đăng xuất Admin" : "Nhập PIN 6 số để mở khóa"}</button>
              </section>
              <section className="glass rounded-[20px] p-4"><p className="text-sm font-extrabold">Nguồn dữ liệu đang xem</p><p className="mt-1 text-xs text-[#8a7360]">Bật/tắt từng nguồn. Lựa chọn lưu riêng trên thiết bị và áp dụng cho các tab.</p><div className="mt-3"><CollectionPicker collections={collections} selectedIds={selectedCollectionIds} onChange={chooseCollections} isAdmin={isAdmin} onImport={() => setImportOpen(true)} /></div></section>
              <section className="glass rounded-[20px] p-4"><p className="text-sm font-extrabold">Chỉ đường mặc định</p><p className="mt-1 text-xs text-[#8a7360]">Dùng khi mở Google Maps.</p><div className="mt-3 flex gap-2"><Chip active={travelMode === "two-wheeler"} onClick={() => setPreferredTravelMode("two-wheeler")}><Bike className="mr-1 inline" size={14} /> Xe máy</Chip><Chip active={travelMode === "driving"} onClick={() => setPreferredTravelMode("driving")}><CarFront className="mr-1 inline" size={14} /> Ô tô</Chip></div></section>
              <FoodFootprint restaurants={restaurants} onOpen={setSelected} />
              <details className="glass rounded-[20px] p-4"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-extrabold"><FileCheck2 size={17} className="text-[#a35e2d]" />Báo cáo chất lượng tọa độ & xuất dữ liệu</summary><div className="mt-4"><ReportView restaurants={restaurants} notify={notify} /></div></details>
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
              <FoodFootprint restaurants={restaurants} onOpen={setSelected} />
            </div>
          )}
          {tab === "roulette" && (
            <FoodRoulette
              restaurants={filtered}
              position={position}
              travelMode={travelMode}
              onOpen={setSelected}
            />
          )}
        </section>
      </div>
      {isAdmin && <button
          onClick={() => setFormTarget(null)}
          className="fixed bottom-7 right-8 z-30 hidden h-14 w-14 items-center justify-center rounded-full bg-[#a35e2d] text-white shadow-lg shadow-[#a35e2d]/35 transition hover:scale-105 active:scale-95 md:flex"
          aria-label="Thêm quán"
        >
          <Plus size={26} strokeWidth={2.7} />
        </button>}
      <nav className={`glass fixed inset-x-3 bottom-3 z-20 mx-auto grid max-w-md ${isAdmin ? "grid-cols-5" : "grid-cols-4"} items-end rounded-[24px] px-1 pb-[calc(.45rem+env(safe-area-inset-bottom))] pt-2 md:hidden`}>
        {navItems.slice(0, 2).map((item) => (
          <button
            key={item.id}
            onClick={() => switchTab(item.id)}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-bold ${tab === item.id ? "bg-[#402c1e] text-[#fbf3ea]" : "text-[#6b5644] dark:text-[#cbb4a0]"}`}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        ))}
        {isAdmin && <button
          type="button"
          onClick={() => setFormTarget(null)}
          className="-mt-8 justify-self-center rounded-full border-4 border-[#fbf3ea] bg-[#a35e2d] p-3 text-white shadow-lg shadow-[#a35e2d]/35 dark:border-[#140e0a]"
          aria-label="Thêm quán mới"
        >
          <Plus size={23} strokeWidth={3} />
        </button>}
        {navItems.slice(2).map((item) => (
          <button
            key={item.id}
            onClick={() => switchTab(item.id)}
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
          onClearVisits={() => clearVisitHistory(selected)}
          travelMode={travelMode}
          ward={wardForRestaurant(selected, adminWards)}
          isAdmin={isAdmin}
        />
      )}
      {formTarget !== undefined && (
        <RestaurantForm
          restaurant={formTarget}
          restaurants={restaurants}
          categories={categories}
          adminWards={adminWards}
          clipboardText={clipboardText}
          onClose={() => setFormTarget(undefined)}
          onSaved={afterSave}
        />
      )}
      {importOpen && <CollectionImportModal onClose={() => setImportOpen(false)} onDone={refresh} />}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-[#402c1e] px-4 py-2 text-sm font-bold text-[#fbf3ea] shadow-xl md:bottom-6">
          {toast}
        </div>
      )}
      <SearchableWardModal
        open={wardPickerOpen}
        wards={wardOptions satisfies WardOption[]}
        value={ward}
        onClose={() => setWardPickerOpen(false)}
        onChange={setWard}
      />
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
  return <SkeletonCard />;
}
function Empty({ text }: { text: string }) {
  return (
    <div className="glass rounded-[20px] px-5 py-12 text-center">
      <Utensils className="mx-auto text-[#a35e2d]" size={26} />
      <p className="mt-3 text-sm text-[#8a7360]">{text}</p>
    </div>
  );
}
