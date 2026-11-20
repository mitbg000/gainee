import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { gradeWord, REVIEW_MODES } from "@/lib/review";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** { rating: 1..4, mode, durationMs? } */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, z.object({ rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), mode: z.enum(REVIEW_MODES), durationMs: z.number().int().min(0).max(3_600_000).optional() }));
  if (err) return err;
  const r = await gradeWord(id, data.rating, data.mode, data.durationMs);
  return r ? NextResponse.json(r) : bad("not_found", 404);
}
