import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { addXp, XP } from "@/lib/activity";
import { AiError } from "@/lib/ai/client";
import { getWriting, gradeWriting, Override } from "@/lib/writing";

export const runtime = "nodejs";
export const maxDuration = 150;
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const cur = id ? await getWriting(id) : undefined;
  if (!id || !cur) return bad("not_found", 404);
  const [data, err] = await parseBody(req, z.object({ override: Override }));
  if (err) return err;
  try {
    const grade = await gradeWriting(id, data.override);
    if (cur.bandOverall == null) await addXp("writing", XP.writing, { type: "writing", id }); // first grading only
    return NextResponse.json(grade);
  } catch (e) {
    if (e instanceof AiError && e.code === "not_configured") return bad("ai_not_configured", 409);
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
