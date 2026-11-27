import { NextResponse } from "next/server";
import { bad, idParam, aiRefused } from "@/lib/api";
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
    const refused = aiRefused(e);
    if (refused) return refused;
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
