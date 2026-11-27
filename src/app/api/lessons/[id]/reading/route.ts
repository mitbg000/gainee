import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { addXp, bumpActivity, XP } from "@/lib/activity";
import { bad, idParam, parseBody } from "@/lib/api";
import { myId, readableLesson } from "@/lib/owner";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Record a timed reading session (WPM + how many look-ups were needed). */
export async function POST(req: Request, { params }: Ctx) {
  const lessonId = idParam((await params).id);
  if (!lessonId) return bad("invalid");
  const [data, err] = await parseBody(req, z.object({ seconds: z.number().int().min(10).max(7200), words: z.number().int().min(1).max(20000), lookups: z.number().int().min(0).max(1000) }));
  if (err) return err;
  const wpm = Math.round(data.words / (data.seconds / 60));
  const userId = await myId();
  if (!(await readableLesson(lessonId, userId))) return bad("not_found", 404);
  const [{ id }] = await getDb().insert(schema.readingSessions).values({ userId, lessonId, ...data, wpm }).$returningId();
  const minutes = Math.max(1, Math.round(data.seconds / 60));
  await bumpActivity({ minutes });
  await addXp("reading", Math.min(30, minutes * XP.readingMinute), { type: "reading", id });
  return NextResponse.json({ wpm });
}
