import { NextResponse, type NextRequest } from "next/server";
import { dueWords } from "@/lib/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?doc=ID → words due now (optionally from one text). */
export async function GET(req: NextRequest) {
  const doc = Number(req.nextUrl.searchParams.get("doc"));
  return NextResponse.json(await dueWords(Number.isInteger(doc) && doc > 0 ? doc : undefined));
}
