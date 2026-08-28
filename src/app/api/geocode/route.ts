import { NextRequest, NextResponse } from "next/server";

type NominatimResult = { lat: string; lon: string; display_name: string };

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
      if (match)
        return NextResponse.json({
          result: {
            lat: Number(match.lat),
            lng: Number(match.lon),
            displayName: match.display_name,
            query: queries[index],
          },
        });
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
