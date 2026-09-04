import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  let body: { pin?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ valid: false }, { status: 400 }); }
  const configured = process.env.ADMIN_PASSCODE?.trim();
  const valid = Boolean(configured && body.pin && /^\d{6}$/.test(body.pin) && body.pin === configured);
  return NextResponse.json({ valid }, { status: valid ? 200 : 401 });
}
