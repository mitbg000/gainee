import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { AiError } from "@/lib/ai/client";
import { fixTranscript } from "@/lib/ielts/import";
import { getSection } from "@/lib/ielts/queries";

export const runtime = "nodejs";
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

/** AI-repaired transcript for the review screen: { text } (the current text in the editor) → { text }. Not saved here. */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getSection(id))) return bad("not_found", 404);
  const [d, err] = await parseBody(req, z.object({ text: z.string().trim().min(20).max(100000) }));
  if (err) return err;
  try {
    return NextResponse.json({ text: await fixTranscript(d.text) });
  } catch (e) {
    if (e instanceof AiError && e.code === "not_configured") return bad("ai_not_configured", 409);
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
