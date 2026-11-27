import { and, asc, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { docVisible, myId } from "@/lib/owner";
import { today } from "./activity";

const { activity, documents, lessons, words, lessonProgress } = schema;

const lessonsDone = (uid: number) => getDb().select({ n: count() }).from(lessonProgress).where(and(eq(lessonProgress.userId, uid), isNotNull(lessonProgress.completedAt)));

/** Consecutive days with any activity, ending today (or yesterday if today is still empty); of `uid`, else of me. */
export async function streak(uid?: number): Promise<number> {
  const rows = await getDb().select({ day: activity.day }).from(activity).where(and(eq(activity.userId, uid ?? (await myId())), sql`(${activity.xp} > 0 or ${activity.minutes} > 0)`)).orderBy(desc(activity.day)).limit(400);
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
  const uid = await myId();
  const [[docs], [done], [w], [act], s] = await Promise.all([
    db.select({ n: count() }).from(documents).where(docVisible(uid)),
    lessonsDone(uid),
    db.select({ n: count() }).from(words).where(eq(words.userId, uid)),
    db.select().from(activity).where(and(eq(activity.userId, uid), eq(activity.day, today()))),
    streak(),
  ]);
  return { documents: docs.n, lessonsDone: done.n, words: w.n, xpToday: act?.xp ?? 0, minutesToday: act?.minutes ?? 0, streak: s };
}

/** The next lesson to read: first ready, unfinished lesson of the most recent text that has one. */
export async function nextLesson() {
  const uid = await myId();
  const [row] = await getDb()
    .select({ id: lessons.id, position: lessons.position, title: lessons.title, documentTitle: documents.title, documentId: documents.id })
    .from(lessons)
    .innerJoin(documents, eq(documents.id, lessons.documentId))
    .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, uid)))
    .where(and(eq(lessons.status, "ready"), isNull(lessonProgress.completedAt), docVisible(uid)))
    .orderBy(desc(documents.updatedAt), asc(lessons.position))
    .limit(1);
  return row ?? null;
}

/** Everything the Progress page shows. */
export async function progressData() {
  const db = getDb();
  const uid = await myId();
  const { readingSessions, answerLogs, attempts } = schema;
  const since = new Date(`${today()}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 7 * 26);
  const [days, [w], mastered, [done], sessions, acc, s] = await Promise.all([
    db.select().from(activity).where(and(eq(activity.userId, uid), sql`${activity.day} >= ${since.toISOString().slice(0, 10)}`)).orderBy(asc(activity.day)),
    db.select({ n: count() }).from(words).where(eq(words.userId, uid)),
    masteredByWeek(), // one definition of "known" everywhere: remembered 3 times
    lessonsDone(uid),
    db.select({ at: readingSessions.createdAt, wpm: readingSessions.wpm, words: readingSessions.words, lookups: readingSessions.lookups }).from(readingSessions).where(eq(readingSessions.userId, uid)).orderBy(desc(readingSessions.id)).limit(20),
    db
      .select({ qtype: answerLogs.qtype, total: count(), correct: sql<number>`sum(${answerLogs.correct})` })
      .from(answerLogs)
      .innerJoin(attempts, eq(attempts.id, answerLogs.attemptId))
      .where(eq(attempts.userId, uid))
      .groupBy(answerLogs.qtype),
    streak(),
  ]);
  const [{ xp }] = await db.select({ xp: sql<number>`coalesce(sum(${activity.xp}), 0)` }).from(activity).where(eq(activity.userId, uid));
  const read = sessions.reverse();
  const totalWords = read.reduce((a, r) => a + r.words, 0);
  return {
    days,
    since: since.toISOString().slice(0, 10),
    totals: { streak: s, xp: Number(xp), words: w.n, mastered: mastered.known, lessonsDone: done.n },
    mastered,
    wpm: read.map((r) => ({ at: r.at, wpm: r.wpm })),
    lookupsPer100: totalWords ? Math.round((read.reduce((a, r) => a + r.lookups, 0) / totalWords) * 1000) / 10 : null,
    accuracy: acc.map((a) => ({ qtype: a.qtype, total: a.total, pct: Math.round((Number(a.correct) / a.total) * 100) })),
  };
}

/** Scores over the attempts of each practice part, oldest first (for the line charts on the Progress page). */
export async function scoreHistory() {
  const db = getDb();
  const uid = await myId();
  const { attempts, writings, assessments } = schema;
  const [reading, writing, practice] = await Promise.all([
    db.select({ score: attempts.score, total: attempts.total, at: attempts.createdAt }).from(attempts).where(eq(attempts.userId, uid)).orderBy(desc(attempts.id)).limit(30),
    db
      .select({ kind: writings.kind, band: writings.bandOverall, at: writings.updatedAt })
      .from(writings)
      .where(and(eq(writings.userId, uid), isNull(writings.lessonId), isNotNull(writings.bandOverall)))
      .orderBy(desc(writings.id))
      .limit(200),
    db.select({ score: assessments.score, max: assessments.maxScore, at: assessments.createdAt }).from(assessments).where(and(eq(assessments.userId, uid), eq(assessments.kind, "word_practice"))).orderBy(desc(assessments.id)).limit(30),
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

/** A word counts as "known for sure" once it has been remembered (Good/Easy, any mode) 3 times. */
export const MASTER_AFTER = 3;

/**
 * Words known for sure, week by week (last 12 weeks, Monday-based, in the app's time zone):
 * the running total at the end of each week and how many became known that week.
 */
export async function masteredByWeek(weeks = 12) {
  const { reviewLogs } = schema;
  const uid = await myId();
  const rows = await getDb()
    .select({ wordId: reviewLogs.wordId, at: reviewLogs.createdAt })
    .from(reviewLogs)
    .innerJoin(words, eq(words.id, reviewLogs.wordId))
    .where(and(eq(words.userId, uid), sql`${reviewLogs.rating} >= 3`))
    .orderBy(asc(reviewLogs.id));
  // the moment each word reached its 3rd good review
  const seen = new Map<number, number>();
  const knownAt: Date[] = [];
  for (const r of rows) {
    const n = (seen.get(r.wordId) ?? 0) + 1;
    seen.set(r.wordId, n);
    if (n === MASTER_AFTER) knownAt.push(r.at);
  }
  const tz = process.env.TZ || "Asia/Ho_Chi_Minh";
  const local = (d: Date) => new Date(new Date(d).toLocaleString("en-US", { timeZone: tz }));
  const monday = (d: Date) => {
    const x = local(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const start = monday(new Date());
  start.setDate(start.getDate() - 7 * (weeks - 1));
  const out = Array.from({ length: weeks }, (_, i) => {
    const from = new Date(start);
    from.setDate(from.getDate() + 7 * i);
    return { week: from, total: 0, added: 0 };
  });
  for (const at of knownAt) {
    const w = monday(at);
    const i = Math.round((w.getTime() - start.getTime()) / (7 * 86400_000));
    if (i < weeks) {
      for (let k = Math.max(0, i); k < weeks; k++) out[k].total++;
      if (i >= 0) out[i].added++;
    }
  }
  const [learning] = await getDb().select({ n: count() }).from(words).where(and(eq(words.userId, uid), sql`${words.reps} > 0`));
  return { weeks: out, known: knownAt.length, studied: learning?.n ?? 0, thisWeek: out[weeks - 1].added };
}
