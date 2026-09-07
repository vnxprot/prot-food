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

export async function PATCH(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Admin required" }, { status: 401 });
  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Missing Supabase service configuration" }, { status: 500 });
  const body = await request.json().catch(() => null) as { collection?: Record<string, unknown>; restaurants?: Record<string, unknown>[]; replaceRestaurants?: boolean } | null;
  const collection = body?.collection;
  if (!collection || typeof collection.id !== "string" || typeof collection.name !== "string") {
    return NextResponse.json({ error: "Invalid collection payload" }, { status: 400 });
  }
  if (body?.replaceRestaurants && (!Array.isArray(body.restaurants) || body.restaurants.length > 2_000)) {
    return NextResponse.json({ error: "Dữ liệu quán không hợp lệ hoặc vượt giới hạn 2.000 dòng." }, { status: 400 });
  }

  const { data: current, error: currentError } = await client.from("collections").select("id,is_default").eq("id", collection.id).single();
  if (currentError || !current) return NextResponse.json({ error: "Không tìm thấy nguồn dữ liệu." }, { status: 404 });
  if (current.is_default) return NextResponse.json({ error: "Không thể sửa nguồn dữ liệu mặc định." }, { status: 400 });

  if (body?.replaceRestaurants) {
    const { data: previousRows, error: previousError } = await client.from("restaurants").select("*").eq("collection_id", collection.id);
    if (previousError) return NextResponse.json({ error: previousError.message }, { status: 400 });
    const { error: deleteError } = await client.from("restaurants").delete().eq("collection_id", collection.id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
    const { error: insertError } = await client.from("restaurants").insert(body.restaurants || []);
    if (insertError) {
      if (previousRows?.length) await client.from("restaurants").insert(previousRows);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  }

  const { error: updateError } = await client.from("collections").update({
    name: collection.name,
    icon: collection.icon,
    owner_name: collection.owner_name,
    type: collection.type,
    source_type: collection.source_type,
    google_sheets_url: collection.google_sheets_url,
  }).eq("id", collection.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  return NextResponse.json({ count: body?.replaceRestaurants ? body.restaurants?.length || 0 : undefined });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Admin required" }, { status: 401 });
  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Missing Supabase service configuration" }, { status: 500 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing collection id" }, { status: 400 });
  const { data: collection, error: lookupError } = await client.from("collections").select("id,is_default").eq("id", id).single();
  if (lookupError || !collection) return NextResponse.json({ error: "Không tìm thấy nguồn dữ liệu." }, { status: 404 });
  if (collection.is_default) return NextResponse.json({ error: "Không thể xóa nguồn dữ liệu mặc định." }, { status: 400 });
  const { error: restaurantsError } = await client.from("restaurants").delete().eq("collection_id", id);
  if (restaurantsError) return NextResponse.json({ error: restaurantsError.message }, { status: 400 });
  const { error: collectionError } = await client.from("collections").delete().eq("id", id);
  if (collectionError) return NextResponse.json({ error: collectionError.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
