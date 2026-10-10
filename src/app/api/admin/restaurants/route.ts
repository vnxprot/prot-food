import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "@/lib/admin-session";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

async function validCollection(client: NonNullable<ReturnType<typeof adminClient>>, id: unknown) {
  if (typeof id !== "string" || !id) return false;
  const { data, error } = await client.from("collections").select("id").eq("id", id).maybeSingle();
  return !error && Boolean(data);
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Admin required" }, { status: 401 });
  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Missing Supabase service configuration" }, { status: 500 });
  const { payload } = await request.json();
  if (!payload || typeof payload !== "object" || !await validCollection(client, payload.collection_id)) {
    return NextResponse.json({ error: "Hãy chọn nguồn dữ liệu hợp lệ." }, { status: 400 });
  }
  const { data, error } = await client.from("restaurants").insert({ ...payload, entry_origin: "manual" }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Admin required" }, { status: 401 });
  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Missing Supabase service configuration" }, { status: 500 });
  const { id, payload } = await request.json();
  if (!id) return NextResponse.json({ error: "Missing restaurant id" }, { status: 400 });
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  if ("collection_id" in payload && !await validCollection(client, payload.collection_id)) {
    return NextResponse.json({ error: "Nguồn dữ liệu không hợp lệ." }, { status: 400 });
  }
  const { data, error } = await client.from("restaurants").update(payload).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Admin required" }, { status: 401 });
  const client = adminClient();
  if (!client) return NextResponse.json({ error: "Missing Supabase service configuration" }, { status: 500 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing restaurant id" }, { status: 400 });
  const { error } = await client.from("restaurants").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
