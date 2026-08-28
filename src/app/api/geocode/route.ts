import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.trim();
  if (!address) return NextResponse.json({ error: "Thiếu địa chỉ" }, { status: 400 });
  const query = `${address}, Hà Nội, Việt Nam`;
  const endpoint = new URL("https://nominatim.openstreetmap.org/search");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("limit", "1");
  endpoint.searchParams.set("countrycodes", "vn");
  endpoint.searchParams.set("q", query);
  try {
    const response = await fetch(endpoint, {
      headers: { "User-Agent": "Prot-Food-PWA/1.0 (personal Hanoi restaurant manager)", "Accept-Language": "vi" },
      next: { revalidate: 0 },
    });
    if (!response.ok) throw new Error("Nominatim không phản hồi");
    const results = await response.json() as Array<{ lat: string; lon: string; display_name: string }>;
    const first = results[0];
    if (!first) return NextResponse.json({ result: null });
    return NextResponse.json({ result: { lat: Number(first.lat), lng: Number(first.lon), displayName: first.display_name } });
  } catch {
    return NextResponse.json({ result: null }, { status: 200 });
  }
}
