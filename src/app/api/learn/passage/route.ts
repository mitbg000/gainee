import { NextResponse } from "next/server";
import { z } from "zod";
import { AiError } from "@/lib/ai/client";
import { bad, parseBody } from "@/lib/api";
import { finishPassage, makePassage } from "@/lib/learn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** A new review passage built from the words you are about to forget. */
export async function GET() {
  try {
    const p = await makePassage();
    return p ? NextResponse.json(p) : bad("too_few_words", 404);
  } catch (e) {
    if (e instanceof AiError && e.code === "not_configured") return bad("ai_not_configured", 409);
    return bad("ai_failed", 502);
  }
}

/** { remembered: wordId[], forgot: wordId[] } → reviews (Good / Again). */
export async function POST(req: Request) {
  const ids = z.array(z.number().int().positive()).max(20);
  const [d, err] = await parseBody(req, z.object({ remembered: ids, forgot: ids }));
  if (err) return err;
  await finishPassage(d.remembered, d.forgot);
  return NextResponse.json({ ok: true });
}
