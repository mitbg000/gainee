import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { assignAudio, getAudio } from "@/lib/ielts/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Use this recording for a test's Listening parts: { testId } (null = none) → { parts }. */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getAudio(id))) return bad("not_found", 404);
  const [d, err] = await parseBody(req, z.object({ testId: z.number().int().positive().nullable() }));
  if (err) return err;
  return NextResponse.json({ parts: await assignAudio(id, d.testId) });
}
