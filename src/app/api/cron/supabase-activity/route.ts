import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const tables = ["restaurants", "admin_wards", "collections"] as const;
  const results = await Promise.all(
    tables.map(async (table) => {
      const { error } = await client.from(table).select("id").limit(1);
      return { table, error: error?.message ?? null };
    }),
  );
  const failed = results.filter((result) => result.error);
  if (failed.length) {
    console.error("Supabase activity check failed", failed);
    return NextResponse.json({ error: "Supabase read failed", failed }, { status: 503 });
  }

  return NextResponse.json({ ok: true, checked: tables });
}
