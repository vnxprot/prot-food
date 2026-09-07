import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "@/lib/admin-session";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Admin required" }, { status: 401 });
  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Missing Supabase service configuration" }, { status: 500 });

  const body = await request.json().catch(() => null) as { collection?: Record<string, unknown>; restaurants?: Record<string, unknown>[] } | null;
  const collection = body?.collection;
  const restaurants = body?.restaurants;
  if (!collection || typeof collection.id !== "string" || typeof collection.name !== "string" || !Array.isArray(restaurants)) {
    return NextResponse.json({ error: "Invalid import payload" }, { status: 400 });
  }
  if (!collection.name.trim() || restaurants.length > 2_000) {
    return NextResponse.json({ error: "Tên nguồn trống hoặc số dòng vượt giới hạn 2.000." }, { status: 400 });
  }

  const { error: collectionError } = await client.from("collections").insert(collection);
  if (collectionError) return NextResponse.json({ error: collectionError.message }, { status: 400 });

  if (!restaurants.length) return NextResponse.json({ count: 0 });
  const { error: restaurantError } = await client.from("restaurants").insert(restaurants);
  if (!restaurantError) return NextResponse.json({ count: restaurants.length });

  await client.from("collections").delete().eq("id", collection.id);
  return NextResponse.json({ error: restaurantError.message }, { status: 400 });
}
