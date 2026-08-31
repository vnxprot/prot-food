import { NextRequest, NextResponse } from "next/server";

type NominatimAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  residential?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  village?: string;
  town?: string;
  city?: string;
  state?: string;
  country_code?: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
};

const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const HANOI_BOUNDS = {
  south: 20.56,
  north: 21.39,
  west: 105.28,
  east: 106.05,
};

function isInsideHanoi(lat: number, lng: number) {
  return (
    lat >= HANOI_BOUNDS.south &&
    lat <= HANOI_BOUNDS.north &&
    lng >= HANOI_BOUNDS.west &&
    lng <= HANOI_BOUNDS.east
  );
}

function streetMatchesInput(input: string, address?: NominatimAddress) {
  const resultStreet = normalized(
    address?.road || address?.pedestrian || address?.residential || "",
  );
  if (!resultStreet) return false;
  const ignored = new Set([
    "so",
    "duong",
    "pho",
    "ngo",
    "ngach",
    "ha",
    "noi",
    "viet",
    "nam",
  ]);
  const inputTokens = normalized(input)
    .split(" ")
    .filter((token) => !/^\d/.test(token) && !ignored.has(token));
  const streetTokens = new Set(
    resultStreet.split(" ").filter((token) => !ignored.has(token)),
  );
  if (!inputTokens.length) return false;
  const matched = inputTokens.filter((token) => streetTokens.has(token)).length;
  return matched / inputTokens.length >= 0.6;
}

function formatHanoiAddress(input: string, address?: NominatimAddress) {
  const base = input
    .replace(/,?\s*(hà nội|ha noi)(,?\s*việt nam)?\s*$/i, "")
    .trim()
    .replace(/,+$/, "");
  const ward =
    address?.suburb ||
    address?.quarter ||
    address?.neighbourhood ||
    address?.village;
  const parts = [base];
  if (ward && !normalized(base).includes(normalized(ward))) parts.push(ward);
  parts.push("Hà Nội");
  return parts.filter(Boolean).join(", ");
}

async function searchNominatim(query: string) {
  const endpoint = new URL("https://nominatim.openstreetmap.org/search");
  endpoint.searchParams.set("format", "jsonv2");
  endpoint.searchParams.set("limit", "5");
  endpoint.searchParams.set("countrycodes", "vn");
  endpoint.searchParams.set("addressdetails", "1");
  endpoint.searchParams.set("viewbox", "105.28,21.39,106.05,20.56");
  endpoint.searchParams.set("bounded", "1");
  endpoint.searchParams.set("q", query);
  const response = await fetch(endpoint, {
    headers: {
      "User-Agent": "Prot-Food-PWA/1.0 (personal Hanoi restaurant manager)",
      "Accept-Language": "vi",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
  return (await response.json()) as NominatimResult[];
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.trim();
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!address) return NextResponse.json({ error: "Thiếu địa chỉ" }, { status: 400 });

  // Street + house number is more reliable than an arbitrary venue name in OSM POI data.
  const queries = [
    `${address}, Hà Nội, Việt Nam`,
    name ? `${name}, ${address}, Hà Nội, Việt Nam` : null,
  ].filter(Boolean) as string[];

  try {
    for (let index = 0; index < queries.length; index += 1) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1100));
      const matches = await searchNominatim(queries[index]);
      for (const match of matches) {
        const addressDetails = match.address;
        const lat = Number(match.lat);
        const lng = Number(match.lon);
        const wardName =
          addressDetails?.suburb ||
          addressDetails?.quarter ||
          addressDetails?.neighbourhood ||
          addressDetails?.village ||
          null;
        const isHanoiText = normalized(
          [addressDetails?.city, addressDetails?.state, match.display_name]
            .filter(Boolean)
            .join(" "),
        ).includes("ha noi");
        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          !isInsideHanoi(lat, lng) ||
          !isHanoiText ||
          !streetMatchesInput(address, addressDetails)
        )
          continue;
        const inputHouseNumber = address.match(
          /^\s*(\d+[a-zA-Z]?(?:[/-]\d+)*)/,
        )?.[1];
        return NextResponse.json({
          result: {
            lat,
            lng,
            displayName: match.display_name,
            formattedAddress: formatHanoiAddress(address, addressDetails),
            wardName,
            confidence:
              inputHouseNumber &&
              normalized(addressDetails?.house_number || "") ===
                normalized(inputHouseNumber)
                ? "high"
                : "low",
            query: queries[index],
          },
        });
      }
    }
    return NextResponse.json({ result: null, reason: "not_found" });
  } catch (error) {
    return NextResponse.json({
      result: null,
      reason: "service_unavailable",
      error: error instanceof Error ? error.message : "Nominatim không phản hồi",
    });
  }
}
