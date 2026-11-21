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

/** Everything the Progress page shows. */
export async function progressData() {
  const db = getDb();
  const { readingSessions, answerLogs } = schema;
  const since = new Date(`${today()}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 7 * 26);
  const [days, [w], [mastered], [done], sessions, acc, s] = await Promise.all([
    db.select().from(activity).where(sql`${activity.day} >= ${since.toISOString().slice(0, 10)}`).orderBy(asc(activity.day)),
    db.select({ n: count() }).from(words),
    db.select({ n: count() }).from(words).where(sql`${words.state} = 2 and ${words.stability} >= 21`),
    db.select({ n: count() }).from(lessons).where(isNotNull(lessons.completedAt)),
    db.select({ at: readingSessions.createdAt, wpm: readingSessions.wpm, words: readingSessions.words, lookups: readingSessions.lookups }).from(readingSessions).orderBy(desc(readingSessions.id)).limit(20),
    db
      .select({ qtype: answerLogs.qtype, total: count(), correct: sql<number>`sum(${answerLogs.correct})` })
      .from(answerLogs)
      .groupBy(answerLogs.qtype),
    streak(),
  ]);
  const [{ xp }] = await db.select({ xp: sql<number>`coalesce(sum(${activity.xp}), 0)` }).from(activity);
  const read = sessions.reverse();
  const totalWords = read.reduce((a, r) => a + r.words, 0);
  return {
    days,
    since: since.toISOString().slice(0, 10),
    totals: { streak: s, xp: Number(xp), words: w.n, mastered: mastered.n, lessonsDone: done.n },
    wpm: read.map((r) => ({ at: r.at, wpm: r.wpm })),
    lookupsPer100: totalWords ? Math.round((read.reduce((a, r) => a + r.lookups, 0) / totalWords) * 1000) / 10 : null,
    accuracy: acc.map((a) => ({ qtype: a.qtype, total: a.total, pct: Math.round((Number(a.correct) / a.total) * 100) })),
  };
}

/** Scores over the attempts of each practice part, oldest first (for the line charts on the Progress page). */
export async function scoreHistory() {
  const db = getDb();
  const { attempts, writings, assessments } = schema;
  const [reading, writing, practice] = await Promise.all([
    db.select({ score: attempts.score, total: attempts.total, at: attempts.createdAt }).from(attempts).orderBy(desc(attempts.id)).limit(30),
    db
      .select({ kind: writings.kind, band: writings.bandOverall, at: writings.updatedAt })
      .from(writings)
      .where(and(isNull(writings.lessonId), isNotNull(writings.bandOverall)))
      .orderBy(desc(writings.id))
      .limit(200),
    db.select({ score: assessments.score, max: assessments.maxScore, at: assessments.createdAt }).from(assessments).where(eq(assessments.kind, "word_practice")).orderBy(desc(assessments.id)).limit(30),
  ]);
  const pct = (a: number, b: number | null) => (b ? Math.round((a / b) * 100) : 0);
  const byKind = new Map<string, { band: number; at: Date }[]>();
  for (const w of writing.reverse()) byKind.set(w.kind, [...(byKind.get(w.kind) ?? []), { band: w.band!, at: w.at }].slice(-20));
  return {
    reading: reading.reverse().map((r) => ({ pct: pct(r.score, r.total), at: r.at })),
    practice: practice.reverse().map((r) => ({ pct: pct(r.score, r.max), at: r.at })),
    writing: [...byKind].map(([kind, pts]) => ({ kind, pts })),
  };
}
