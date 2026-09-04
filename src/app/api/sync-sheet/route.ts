import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function sheetExportUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.hostname !== "docs.google.com") return null;
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  const gid = url.searchParams.get("gid") || url.hash.match(/gid=(\d+)/)?.[1] || "0";
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")?.trim();
  if (!rawUrl) return NextResponse.json({ error: "Thiếu link Google Sheets." }, { status: 400 });
  const exportUrl = sheetExportUrl(rawUrl);
  if (!exportUrl) return NextResponse.json({ error: "Link Google Sheets không hợp lệ." }, { status: 400 });
  try {
    const response = await fetch(exportUrl, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return NextResponse.json({ error: "Không tải được Sheet. Hãy kiểm tra quyền chia sẻ công khai." }, { status: 502 });
    return new NextResponse(await response.text(), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Google Sheets không phản hồi." }, { status: 502 });
  }
}
