import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieValue, isAdminRequest } from "@/lib/admin-session";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 };

export async function GET(request: NextRequest) {
  return NextResponse.json({ admin: isAdminRequest(request) });
}

export async function POST(request: NextRequest) {
  let body: { pin?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ valid: false }, { status: 400 }); }
  const configured = process.env.ADMIN_PASSCODE?.trim();
  const valid = Boolean(configured && body.pin && /^\d{6}$/.test(body.pin) && body.pin === configured);
  if (!valid) return NextResponse.json({ valid: false }, { status: 401 });
  const response = NextResponse.json({ valid: true });
  response.cookies.set(ADMIN_COOKIE, adminCookieValue(), cookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
