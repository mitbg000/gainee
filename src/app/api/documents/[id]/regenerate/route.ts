import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { regenerate } from "@/lib/documents/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Re-run AI generation for some lessons (or every lesson that is not ready). */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, z.object({ lessonIds: z.array(z.number().int().positive()).max(100).optional() }));
  if (err) return err;
  return NextResponse.json({ jobId: await regenerate(id, data.lessonIds) });
}
