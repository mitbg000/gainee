import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { addXp, bumpActivity, XP } from "@/lib/activity";
import { bad, idParam, parseBody } from "@/lib/api";
import { getLessonData } from "@/lib/lessons/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const data = id ? await getLessonData(id) : null;
  return data ? NextResponse.json(data) : bad("not_found", 404);
}

/** { notes?: string, completed?: boolean } */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, z.object({ notes: z.string().max(20000).optional(), completed: z.boolean().optional() }));
  if (err) return err;
  const db = getDb();
  const [cur] = await db.select({ completedAt: schema.lessons.completedAt }).from(schema.lessons).where(eq(schema.lessons.id, id));
  if (!cur) return bad("not_found", 404);
  await db
    .update(schema.lessons)
    .set({
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.completed !== undefined ? { completedAt: data.completed ? (cur.completedAt ?? new Date()) : null } : {}),
    })
    .where(eq(schema.lessons.id, id));
  if (data.completed && !cur.completedAt) {
    await bumpActivity({ lessonsDone: 1 });
    await addXp("lesson_done", XP.lessonDone, { type: "lesson", id });
  }
  return NextResponse.json({ ok: true });
}
