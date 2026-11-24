import { NextResponse } from "next/server";
import { z } from "zod";
import { AiError } from "@/lib/ai/client";
import { bad, parseBody } from "@/lib/api";
import { checkSentence } from "@/lib/learn";

export const runtime = "nodejs";
export const maxDuration = 60;

/** { wordId, sentence } → { score 0–2, feedback, better }; also logged as a review of the word. */
export async function POST(req: Request) {
  const [d, err] = await parseBody(req, z.object({ wordId: z.number().int().positive(), sentence: z.string().trim().min(2).max(500) }));
  if (err) return err;
  try {
    const r = await checkSentence(d.wordId, d.sentence);
    return r ? NextResponse.json(r) : bad("not_found", 404);
  } catch (e) {
    if (e instanceof AiError && e.code === "not_configured") return bad("ai_not_configured", 409);
    return bad("ai_failed", 502);
  }
}
