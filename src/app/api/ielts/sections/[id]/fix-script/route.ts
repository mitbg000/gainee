import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody, aiRefused } from "@/lib/api";
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
    const refused = aiRefused(e);
    if (refused) return refused;
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
