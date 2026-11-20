import { NextResponse, type NextRequest } from "next/server";
import { lookup } from "@/lib/dictionary/lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 100);
  if (!q.trim()) return NextResponse.json({ error: "missing_query" }, { status: 400 });
  return NextResponse.json(await lookup(q), { headers: { "cache-control": "private, max-age=3600" } });
}
