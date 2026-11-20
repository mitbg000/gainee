import { and, asc, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { today } from "./activity";

const { activity, documents, lessons, words } = schema;

/** Consecutive days with any activity, ending today (or yesterday if today is still empty). */
export async function streak(): Promise<number> {
  const rows = await getDb().select({ day: activity.day }).from(activity).where(sql`${activity.xp} > 0 or ${activity.minutes} > 0`).orderBy(desc(activity.day)).limit(400);
  const days = new Set(rows.map((r) => r.day));
  const d = new Date(`${today()}T00:00:00Z`);
  if (!days.has(today())) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (days.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}

export async function dashboardStats() {
  const db = getDb();
  const [[docs], [done], [w], [act], s] = await Promise.all([
    db.select({ n: count() }).from(documents),
    db.select({ n: count() }).from(lessons).where(isNotNull(lessons.completedAt)),
    db.select({ n: count() }).from(words),
    db.select().from(activity).where(eq(activity.day, today())),
    streak(),
  ]);
  return { documents: docs.n, lessonsDone: done.n, words: w.n, xpToday: act?.xp ?? 0, minutesToday: act?.minutes ?? 0, streak: s };
}

/** The next lesson to read: first ready, unfinished lesson of the most recent text that has one. */
export async function nextLesson() {
  const [row] = await getDb()
    .select({ id: lessons.id, position: lessons.position, title: lessons.title, documentTitle: documents.title, documentId: documents.id })
    .from(lessons)
    .innerJoin(documents, eq(documents.id, lessons.documentId))
    .where(and(eq(lessons.status, "ready"), isNull(lessons.completedAt)))
    .orderBy(desc(documents.updatedAt), asc(lessons.position))
    .limit(1);
  return row ?? null;
}
