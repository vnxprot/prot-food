import { NextRequest, NextResponse } from "next/server";
import { smartEstimatedDistanceKm } from "@/lib/hanoi-obstacles";

export const runtime = "nodejs";

const ROUTING_BASES = [
  "https://routing.openstreetmap.de/routed-car",
  "https://router.project-osrm.org",
] as const;
const MAX_DESTINATIONS = 25;
const MIN_REQUEST_INTERVAL_MS = 1_100;
const lastRequestByClient = new Map<string, number>();

type Coordinate = { id: string; lat: number; lng: number };

function isCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object") return false;
  const coordinate = value as Coordinate;
  return (
    typeof coordinate.id === "string" &&
    typeof coordinate.lat === "number" &&
    typeof coordinate.lng === "number" &&
    Number.isFinite(coordinate.lat) &&
    Number.isFinite(coordinate.lng) &&
    coordinate.lat >= -90 &&
    coordinate.lat <= 90 &&
    coordinate.lng >= -180 &&
    coordinate.lng <= 180
  );
}

function locationOf({ lat, lng }: Pick<Coordinate, "lat" | "lng">) {
  return `${lng},${lat}`;
}

function estimatedResponse(origin: Coordinate, destinations: Coordinate[]) {
  return NextResponse.json({
    distances: Object.fromEntries(
      destinations.map((destination) => [
        destination.id,
        Math.round(smartEstimatedDistanceKm(origin, destination) * 1000),
      ]),
    ),
    isEstimated: true,
  });
}

async function requestDistances(
  base: (typeof ROUTING_BASES)[number],
  origin: Coordinate,
  destinations: Coordinate[],
) {
  const coordinates = [origin, ...destinations].map(locationOf).join(";");
  const destinationIndexes = destinations.map((_, index) => index + 1).join(";");
  const url = `${base}/table/v1/driving/${coordinates}?sources=0&destinations=${destinationIndexes}&annotations=distance`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Prot Food PWA/3.1 (personal restaurant list; contact: vnxprot@gmail.com)",
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Routing response: ${response.status}`);
  const payload = (await response.json()) as { distances?: Array<Array<number | null>> };
  const distances = payload.distances?.[0];
  if (!distances || distances.length !== destinations.length)
    throw new Error("Không nhận được ma trận quãng đường.");
  return distances;
}

export async function POST(request: NextRequest) {
  let body: { origin?: Omit<Coordinate, "id">; destinations?: Coordinate[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu route không hợp lệ." }, { status: 400 });
  }

  const origin = body.origin && { id: "origin", ...body.origin };
  const destinations = body.destinations;
  if (
    !isCoordinate(origin) ||
    !Array.isArray(destinations) ||
    !destinations.length ||
    destinations.length > MAX_DESTINATIONS ||
    !destinations.every(isCoordinate)
  ) {
    return NextResponse.json({ error: "Toạ độ route không hợp lệ." }, { status: 400 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for") || "anonymous";
  const clientKey = forwardedFor.split(",")[0]?.trim() || "anonymous";
  const now = Date.now();
  const lastRequest = lastRequestByClient.get(clientKey) || 0;
  if (now - lastRequest < MIN_REQUEST_INTERVAL_MS) {
    return estimatedResponse(origin, destinations);
  }
  lastRequestByClient.set(clientKey, now);

  for (const base of ROUTING_BASES) {
    try {
      const distances = await requestDistances(base, origin, destinations);
      return NextResponse.json({
        distances: Object.fromEntries(
          destinations.map((destination, index) => [
            destination.id,
            distances[index] ??
              Math.round(smartEstimatedDistanceKm(origin, destination) * 1000),
          ]),
        ),
        isEstimated: distances.some((distance) => distance == null),
      });
    } catch {
      // Try the next free provider before falling back to local geometry.
    }
  }

  return estimatedResponse(origin, destinations);
}
