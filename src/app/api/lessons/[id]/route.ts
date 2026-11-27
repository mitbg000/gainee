import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { addXp, bumpActivity, XP } from "@/lib/activity";
import { bad, idParam, parseBody } from "@/lib/api";
import { getLessonData } from "@/lib/lessons/queries";
import { canEditDoc, myId, readableLesson } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const data = id ? await getLessonData(id) : null;
  return data ? NextResponse.json(data) : bad("not_found", 404);
}

/** { notes?, completed?, title?, titleVi? } */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, z.object({ notes: z.string().max(20000).optional(), completed: z.boolean().optional(), title: z.string().trim().min(1).max(500).optional(), titleVi: z.string().trim().max(500).nullable().optional() }));
  if (err) return err;
  const db = getDb();
  const userId = await myId();
  const doc = await readableLesson(id, userId);
  if (!doc) return bad("not_found", 404);
  // the title belongs to the text (its owner); notes and "done" are this learner's
  if (data.title !== undefined || data.titleVi !== undefined) {
    if (!(await canEditDoc(doc.documentId))) return bad("forbidden", 403);
    await db
      .update(schema.lessons)
      .set({ ...(data.title !== undefined ? { title: data.title } : {}), ...(data.titleVi !== undefined ? { titleVi: data.titleVi || null } : {}) })
      .where(eq(schema.lessons.id, id));
  }
  const P = schema.lessonProgress;
  const [cur] = await db.select({ completedAt: P.completedAt }).from(P).where(and(eq(P.userId, userId), eq(P.lessonId, id)));
  const mine = {
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.completed !== undefined ? { completedAt: data.completed ? (cur?.completedAt ?? new Date()) : null } : {}),
  };
  if (Object.keys(mine).length) await db.insert(P).values({ userId, lessonId: id, ...mine }).onDuplicateKeyUpdate({ set: mine });
  if (data.completed && !cur?.completedAt) {
    await bumpActivity({ lessonsDone: 1 });
    await addXp("lesson_done", XP.lessonDone, { type: "lesson", id });
  }
  return NextResponse.json({ ok: true });
}
