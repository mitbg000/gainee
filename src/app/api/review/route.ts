import { NextResponse, type NextRequest } from "next/server";
import { dueWords } from "@/lib/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?doc=ID → words due now (optionally from one text); ?limit=N for a short session. */
export async function GET(req: NextRequest) {
  const doc = Number(req.nextUrl.searchParams.get("doc"));
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50));
  return NextResponse.json(await dueWords(Number.isInteger(doc) && doc > 0 ? doc : undefined, limit));
}
