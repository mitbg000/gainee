import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, idParam, parseBody } from "@/lib/api";
import { myId, readableLesson } from "@/lib/owner";
import { wordCount } from "@/lib/text/clean";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Auto-save the learner's paraphrase / speaking / writing answer (one per kind per lesson). */
export async function PUT(req: Request, { params }: Ctx) {
  const lessonId = idParam((await params).id);
  if (!lessonId) return bad("invalid");
  const [data, err] = await parseBody(req, z.object({ kind: z.enum(["paraphrase", "speaking", "task1", "task2", "free"]), prompt: z.string().max(2000).optional(), body: z.string().max(20000) }));
  if (err) return err;
  const db = getDb();
  const w = schema.writings;
  const userId = await myId();
  if (!(await readableLesson(lessonId, userId))) return bad("not_found", 404);
  const [cur] = await db.select({ id: w.id }).from(w).where(and(eq(w.userId, userId), eq(w.lessonId, lessonId), eq(w.kind, data.kind)));
  const values = { prompt: data.prompt ?? null, body: data.body, wordCount: wordCount(data.body) };
  if (cur) await db.update(w).set(values).where(eq(w.id, cur.id));
  else await db.insert(w).values({ userId, lessonId, kind: data.kind, ...values });
  return NextResponse.json({ ok: true });
}
