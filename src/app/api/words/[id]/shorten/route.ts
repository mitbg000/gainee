import { NextResponse } from "next/server";
import { AiError } from "@/lib/ai/client";
import { bad, idParam } from "@/lib/api";
import { shortenWord } from "@/lib/words";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/** POST (?save=1 to store it) → a shorter flashcard for this word, written by AI. */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  try {
    const card = await shortenWord(id, new URL(req.url).searchParams.get("save") === "1");
    return card ? NextResponse.json(card) : bad("not_found", 404);
  } catch (e) {
    if (e instanceof AiError && e.code === "not_configured") return bad("ai_not_configured", 409);
    return bad("ai_failed", 502);
  }
}
