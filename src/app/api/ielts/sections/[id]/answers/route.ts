import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { AiError } from "@/lib/ai/client";
import { readAnswers } from "@/lib/ielts/import";

export const runtime = "nodejs";
export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

/** Read this part's answers again from the book's answer key with AI (nothing is saved: the review screen merges them). */
export async function POST(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("not_found", 404);
  try {
    const answers = await readAnswers(id);
    return answers ? NextResponse.json({ answers }) : bad("no_key_pages", 404);
  } catch (e) {
    if (e instanceof AiError && e.code === "not_configured") return bad("ai_not_configured", 409);
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
