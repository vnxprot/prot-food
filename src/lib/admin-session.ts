import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE = "prot_food_admin";

function token() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSCODE;
  return secret ? createHmac("sha256", secret).update("prot-food-admin-v1").digest("base64url") : "";
}

export function isAdminRequest(request: NextRequest) {
  const actual = request.cookies.get(ADMIN_COOKIE)?.value || "";
  const expected = token();
  if (!actual || !expected || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function adminCookieValue() { return token(); }
