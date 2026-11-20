import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { GOAL_KINDS, setGoals } from "@/lib/goals";

export const runtime = "nodejs";

/** { daily_minutes?, daily_reviews?, weekly_lessons?, weekly_words? } – 0 turns a goal off. */
export async function PUT(req: Request) {
  const [data, err] = await parseBody(req, z.object(Object.fromEntries(GOAL_KINDS.map((k) => [k, z.number().int().min(0).max(1000).optional()]))));
  if (err) return err;
  await setGoals(data as Record<string, number>);
  return NextResponse.json({ ok: true });
}
