import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ROUTING_BASE = "https://routing.openstreetmap.de/routed-car";
const MAX_DESTINATIONS = 12;
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
    return NextResponse.json({ error: "Đang cập nhật quãng đường." }, { status: 429 });
  }
  lastRequestByClient.set(clientKey, now);

  const coordinates = [origin, ...destinations].map(locationOf).join(";");
  const destinationIndexes = destinations.map((_, index) => index + 1).join(";");
  const url = `${ROUTING_BASE}/table/v1/driving/${coordinates}?sources=0&destinations=${destinationIndexes}&annotations=distance`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Prot Food PWA/2.0 (personal restaurant list; contact: vnxprot@gmail.com)",
        Accept: "application/json",
      },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Routing response: ${response.status}`);
    const payload = (await response.json()) as { distances?: Array<Array<number | null>> };
    const distances = payload.distances?.[0];
    if (!distances || distances.length !== destinations.length)
      throw new Error("Không nhận được ma trận quãng đường.");

    return NextResponse.json({
      distances: Object.fromEntries(
        destinations.map((destination, index) => [destination.id, distances[index]]),
      ),
    });
  } catch {
    return NextResponse.json(
      { error: "Không thể tính quãng đường đường bộ lúc này." },
      { status: 503 },
    );
  }
}
