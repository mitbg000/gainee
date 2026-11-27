import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
import { parseBody } from "@/lib/api";

export const runtime = "nodejs";

/** One finished word-practice round, kept for the score chart on the Progress page. */
export async function POST(req: Request) {
  const [d, err] = await parseBody(req, z.object({ score: z.number().int().min(0), total: z.number().int().min(1).max(5000), mode: z.string().max(20) }).refine((x) => x.score <= x.total));
  if (err) return err;
  await getDb().insert(schema.assessments).values({ userId: await myId(), kind: "word_practice", score: d.score, maxScore: d.total, detail: { mode: d.mode } });
  return NextResponse.json({ ok: true }, { status: 201 });
}
