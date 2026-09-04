import { haversineKm } from "./utils";

export type Position = { lat: number; lng: number };
type River = "red_river" | "duong_river";

export const HANOI_BRIDGES = [
  { name: "Cầu Thăng Long", lat: 21.0975, lng: 105.7877, river: "red_river" },
  { name: "Cầu Nhật Tân", lat: 21.0927, lng: 105.8197, river: "red_river" },
  { name: "Cầu Long Biên", lat: 21.0427, lng: 105.8568, river: "red_river" },
  { name: "Cầu Chương Dương", lat: 21.0382, lng: 105.8618, river: "red_river" },
  { name: "Cầu Vĩnh Tuy", lat: 21.0065, lng: 105.8778, river: "red_river" },
  { name: "Cầu Thanh Trì", lat: 20.9885, lng: 105.903, river: "red_river" },
  { name: "Cầu Đông Trù", lat: 21.0772, lng: 105.8614, river: "duong_river" },
  { name: "Cầu Đuống", lat: 21.0694, lng: 105.9004, river: "duong_river" },
] as const;

export const HANOI_LAKES = [
  {
    name: "Hồ Tây & Trúc Bạch",
    center: { lat: 21.058, lng: 105.824 },
    radiusKm: 1.55,
    detourPenaltyKm: 5.5,
  },
  {
    name: "Hồ Linh Đàm",
    center: { lat: 20.967, lng: 105.828 },
    radiusKm: 0.7,
    detourPenaltyKm: 2.2,
  },
] as const;

// Center-line samples follow each river through the Hanoi urban area. Keeping
// these as data (instead of a remote map lookup) makes the estimator instant.
const RIVER_LINES: Record<River, Position[]> = {
  red_river: [
    { lat: 21.13, lng: 105.745 },
    { lat: 21.095, lng: 105.81 },
    { lat: 21.07, lng: 105.84 },
    { lat: 21.04, lng: 105.86 },
    { lat: 21.01, lng: 105.88 },
    { lat: 20.98, lng: 105.91 },
    { lat: 20.94, lng: 105.93 },
  ],
  duong_river: [
    { lat: 21.094, lng: 105.84 },
    { lat: 21.078, lng: 105.875 },
    { lat: 21.068, lng: 105.91 },
    { lat: 21.06, lng: 105.96 },
  ],
};

function projected(point: Position, referenceLat: number) {
  return {
    x: point.lng * 111.32 * Math.cos((referenceLat * Math.PI) / 180),
    y: point.lat * 110.574,
  };
}

function distanceToSegmentKm(point: Position, start: Position, end: Position) {
  const p = projected(point, point.lat);
  const a = projected(start, point.lat);
  const b = projected(end, point.lat);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function segmentCrossesLake(a: Position, b: Position, lake: (typeof HANOI_LAKES)[number]) {
  if (haversineKm(a.lat, a.lng, b.lat, b.lng) < 0.25) return false;
  return distanceToSegmentKm(lake.center, a, b) < lake.radiusKm;
}

function orientation(a: Position, b: Position, c: Position) {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position) {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  return first * second <= 0 && third * fourth <= 0;
}

function crossesRiver(a: Position, b: Position, river: River) {
  const line = RIVER_LINES[river];
  for (let index = 0; index < line.length - 1; index += 1) {
    if (segmentsIntersect(a, b, line[index], line[index + 1])) return true;
  }
  return false;
}

function bridgeDistanceKm(a: Position, b: Position, river: River) {
  return Math.min(
    ...HANOI_BRIDGES.filter((bridge) => bridge.river === river).map(
      (bridge) =>
        haversineKm(a.lat, a.lng, bridge.lat, bridge.lng) +
        haversineKm(bridge.lat, bridge.lng, b.lat, b.lng),
    ),
  );
}

export function smartEstimatedDistanceKm(a: Position, b: Position) {
  const airDistance = haversineKm(a.lat, a.lng, b.lat, b.lng);
  if (!Number.isFinite(airDistance)) return Infinity;
  if (airDistance === 0) return 0;

  for (const lake of HANOI_LAKES) {
    if (segmentCrossesLake(a, b, lake)) {
      return airDistance * 1.25 + lake.detourPenaltyKm;
    }
  }

  for (const river of ["red_river", "duong_river"] as const) {
    if (crossesRiver(a, b, river)) {
      const viaBridge = bridgeDistanceKm(a, b, river) * 1.2;
      // A bridge coordinate is only its midpoint. This floor accounts for
      // ramps and approach roads that the two straight midpoint legs omit.
      return Math.max(viaBridge, airDistance * 1.2 + 2.5);
    }
  }

  return airDistance * 1.35;
}
