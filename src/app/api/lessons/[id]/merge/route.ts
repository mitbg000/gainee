import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { mergeWithNext } from "@/lib/lessons/edit";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Merge this lesson with the next one and regenerate the exercises. */
export async function POST(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const r = await mergeWithNext(id);
  return r ? NextResponse.json(r) : bad("no_next_lesson", 404);
}
