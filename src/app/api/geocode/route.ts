import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.trim();
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!address) return NextResponse.json({ error: "Thiếu địa chỉ" }, { status: 400 });
  // Include the venue name so that Nominatim can prefer a POI over a street.
  // The app still labels this result low-confidence until manually checked.
  const query = [name, address, "Hà Nội, Việt Nam"].filter(Boolean).join(", ");
  const endpoint = new URL("https://nominatim.openstreetmap.org/search");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("limit", "5");
  endpoint.searchParams.set("countrycodes", "vn");
  endpoint.searchParams.set("q", query);
  try {
    const response = await fetch(endpoint, {
      headers: { "User-Agent": "Prot-Food-PWA/1.0 (personal Hanoi restaurant manager)", "Accept-Language": "vi" },
      next: { revalidate: 0 },
    });
    if (!response.ok) throw new Error("Nominatim không phản hồi");
    const results = await response.json() as Array<{ lat: string; lon: string; display_name: string }>;
    const normalizedName = name?.toLocaleLowerCase("vi") || "";
    const match = results.find((item) => normalizedName && item.display_name.toLocaleLowerCase("vi").includes(normalizedName)) || results[0];
    if (!match) return NextResponse.json({ result: null });
    return NextResponse.json({ result: { lat: Number(match.lat), lng: Number(match.lon), displayName: match.display_name } });
  } catch {
    return NextResponse.json({ result: null }, { status: 200 });
  }
}
