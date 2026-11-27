import { NextResponse } from "next/server";
import { z } from "zod";
import { aiRefused, bad, idParam, parseBody } from "@/lib/api";
import { blanksFromPages } from "@/lib/ielts/import";

export const runtime = "nodejs";
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

const Input = z.object({
  from: z.number().int().min(1).max(60),
  to: z.number().int().min(1).max(60),
  instructions: z.string().max(2000).default(""),
  answers: z.record(z.string(), z.string().max(200)).default({}),
});

/** One completion group written again with [[n]] blanks by AI from the book's pages: { text, wrong }. Not saved here. */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("not_found", 404);
  const [d, err] = await parseBody(req, Input);
  if (err) return err;
  if (d.to < d.from || d.to - d.from > 40) return bad("invalid");
  try {
    const r = await blanksFromPages(id, d.from, d.to, d.instructions, d.answers);
    return r ? NextResponse.json(r) : bad("not_found", 404);
  } catch (e) {
    const refused = aiRefused(e);
    if (refused) return refused;
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
