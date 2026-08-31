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
  endpoint.searchParams.set("limit", "1");
  endpoint.searchParams.set("countrycodes", "vn");
  endpoint.searchParams.set("addressdetails", "1");
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
      const match = (await searchNominatim(queries[index]))[0];
      if (match) {
        const addressDetails = match.address;
        const wardName =
          addressDetails?.suburb ||
          addressDetails?.quarter ||
          addressDetails?.neighbourhood ||
          addressDetails?.village ||
          null;
        const isHanoi = normalized(
          [addressDetails?.city, addressDetails?.state, match.display_name]
            .filter(Boolean)
            .join(" "),
        ).includes("ha noi");
        return NextResponse.json({
          result: {
            lat: Number(match.lat),
            lng: Number(match.lon),
            displayName: match.display_name,
            formattedAddress: formatHanoiAddress(address, addressDetails),
            wardName,
            confidence:
              isHanoi && addressDetails?.house_number ? "high" : "low",
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
