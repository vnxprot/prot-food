import type { Restaurant, Status } from "./types";

export const statusLabel: Record<Status, string> = { muon_den: "Muốn đến", da_den: "Đã đến" };
export const tasteLabel = { ngon: "Ngon", khong_ngon: "Không ngon" };
export const priceLabel = { re: "₫", binh_thuong: "₫₫", dat: "₫₫₫" };

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(distance?: number | null) {
  if (distance == null || !Number.isFinite(distance)) return "—";
  if (distance < 1) return `${Math.round(distance * 1000)}m`;
  return `${distance.toFixed(distance < 10 ? 1 : 0)}km`;
}

export type TravelMode = "two-wheeler" | "driving";

export function directionsUrl(
  restaurant: Restaurant,
  travelMode: TravelMode = "two-wheeler",
) {
  // Coordinates from automatic geocoding are deliberately not used for routing.
  // A street-level Nominatim match can be hundreds of metres away from the shop.
  // Only a manually verified pin is safe to send to Google Maps as coordinates.
  const hasVerifiedPin = restaurant.lat != null && restaurant.lng != null && restaurant.geocode_confidence === "manual";
  const destination = hasVerifiedPin
    ? `${restaurant.lat},${restaurant.lng}`
    : encodeURIComponent([restaurant.name, restaurant.address_raw, "Hà Nội, Việt Nam"].filter(Boolean).join(", "));
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=${travelMode}`;
}

export function relativeDate(date?: string | null) {
  if (!date) return null;
  const days = Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86_400_000);
  if (days === 0) return "hôm nay";
  if (days === 1) return "hôm qua";
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  if (days < 365) return `${Math.floor(days / 30)} tháng trước`;
  return `${Math.floor(days / 365)} năm trước`;
}
