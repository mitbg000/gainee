import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody, aiRefused } from "@/lib/api";
import { answersByAi } from "@/lib/ielts/import";

export const runtime = "nodejs";
export const maxDuration = 200;
type Ctx = { params: Promise<{ id: string }> };

/** Answers worked out by AI from the questions and { transcript } (the editor's current text); not saved here. */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("not_found", 404);
  const [d, err] = await parseBody(req, z.object({ transcript: z.string().max(100000).default("") }));
  if (err) return err;
  try {
    const answers = await answersByAi(id, d.transcript);
    return answers ? NextResponse.json({ answers }) : bad("no_source", 404);
  } catch (e) {
    const refused = aiRefused(e);
    if (refused) return refused;
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
