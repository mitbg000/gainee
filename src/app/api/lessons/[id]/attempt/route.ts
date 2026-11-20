import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { addXp, XP } from "@/lib/activity";
import { bad, idParam, parseBody } from "@/lib/api";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Input = z.object({
  durationSec: z.number().int().min(0).max(36000).optional(),
  answers: z
    .array(
      z.object({
        qtype: z.enum(["tfng", "ynng", "mcq", "gap", "matching", "heading", "short"]),
        correct: z.boolean(),
        given: z.string().max(500).optional(),
        expected: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(100),
});

/** Save one exercise attempt; per-question rows feed "accuracy by question type". */
export async function POST(req: Request, { params }: Ctx) {
  const lessonId = idParam((await params).id);
  if (!lessonId) return bad("invalid");
  const [data, err] = await parseBody(req, Input);
  if (err) return err;
  const db = getDb();
  const score = data.answers.filter((a) => a.correct).length;
  const total = data.answers.length;
  const pct = Math.round((score / total) * 100);

  const [lesson] = await db.select({ bestScore: schema.lessons.bestScore }).from(schema.lessons).where(eq(schema.lessons.id, lessonId));
  if (!lesson) return bad("not_found", 404);
  const firstTry = lesson.bestScore == null;

  const attemptId = await db.transaction(async (tx) => {
    const [{ id }] = await tx.insert(schema.attempts).values({ lessonId, score, total, durationSec: data.durationSec }).$returningId();
    await tx.insert(schema.answerLogs).values(data.answers.map((a) => ({ attemptId: id, ...a })));
    if (lesson.bestScore == null || pct > lesson.bestScore) await tx.update(schema.lessons).set({ bestScore: pct }).where(eq(schema.lessons.id, lessonId));
    return id;
  });
  // XP only for the first attempt, so retrying does not farm points
  if (firstTry) {
    await addXp("answers", score * XP.correctAnswer, { type: "attempt", id: attemptId });
    if (score === total) await addXp("perfect_score", XP.perfectScore, { type: "attempt", id: attemptId });
  }
  return NextResponse.json({ score, total, pct, best: Math.max(pct, lesson.bestScore ?? 0) });
}
