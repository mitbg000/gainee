/** Daily activity + XP bookkeeping (feeds streaks, heat map and the dashboard). */
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export function today(tz = process.env.TZ || "Asia/Ho_Chi_Minh"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

type Counters = Partial<{ minutes: number; xp: number; reviews: number; lessonsDone: number; wordsAdded: number }>;

export async function bumpActivity(c: Counters) {
  const v = { minutes: 0, xp: 0, reviews: 0, lessonsDone: 0, wordsAdded: 0, ...c };
  const a = schema.activity;
  await getDb()
    .insert(a)
    .values({ day: today(), ...v })
    .onDuplicateKeyUpdate({
      set: {
        minutes: sql`${a.minutes} + ${v.minutes}`,
        xp: sql`${a.xp} + ${v.xp}`,
        reviews: sql`${a.reviews} + ${v.reviews}`,
        lessonsDone: sql`${a.lessonsDone} + ${v.lessonsDone}`,
        wordsAdded: sql`${a.wordsAdded} + ${v.wordsAdded}`,
      },
    });
}

export const XP = { lessonDone: 50, perfectScore: 30, correctAnswer: 5, readingMinute: 2, wordSaved: 2, writing: 15 } as const;

export async function addXp(kind: string, amount: number, ref?: { type: string; id: number }) {
  if (amount <= 0) return;
  await getDb().insert(schema.xpEvents).values({ kind, amount, refType: ref?.type, refId: ref?.id });
  await bumpActivity({ xp: amount });
}
