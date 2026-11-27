/** Daily / weekly goals and achievement badges. */
import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
import { today } from "./activity";

const { goals, activity, achievements, reviewLogs } = schema;

export const GOAL_KINDS = ["daily_minutes", "daily_reviews", "weekly_lessons", "weekly_words"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];
export const DEFAULT_GOALS: Record<GoalKind, number> = { daily_minutes: 15, daily_reviews: 20, weekly_lessons: 3, weekly_words: 30 };

export async function getGoals(): Promise<Record<GoalKind, number>> {
  const rows = await getDb().select().from(goals).where(and(eq(goals.userId, await myId()), eq(goals.active, true)));
  const out = { ...DEFAULT_GOALS };
  for (const r of rows) if ((GOAL_KINDS as readonly string[]).includes(r.kind)) out[r.kind as GoalKind] = r.target;
  return out;
}

/** Replace the targets (0 turns a goal off). */
export async function setGoals(targets: Partial<Record<GoalKind, number>>) {
  const db = getDb();
  const uid = await myId();
  for (const [kind, target] of Object.entries(targets) as [GoalKind, number][]) {
    await db.delete(goals).where(and(eq(goals.userId, uid), eq(goals.kind, kind)));
    await db.insert(goals).values({ userId: uid, kind, target, active: target > 0 });
  }
}

function weekStart() {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
  return d.toISOString().slice(0, 10);
}

/** Current value vs target for every active goal. */
export async function goalProgress() {
  const db = getDb();
  const uid = await myId();
  const [targets, [day], [week]] = await Promise.all([
    getGoals(),
    db.select().from(activity).where(and(eq(activity.userId, uid), eq(activity.day, today()))),
    db
      .select({ lessons: sql<number>`coalesce(sum(${activity.lessonsDone}), 0)`, words: sql<number>`coalesce(sum(${activity.wordsAdded}), 0)` })
      .from(activity)
      .where(and(eq(activity.userId, uid), gte(activity.day, weekStart()))),
  ]);
  const value: Record<GoalKind, number> = {
    daily_minutes: day?.minutes ?? 0,
    daily_reviews: day?.reviews ?? 0,
    weekly_lessons: Number(week.lessons),
    weekly_words: Number(week.words),
  };
  return GOAL_KINDS.filter((k) => targets[k] > 0).map((k) => ({ kind: k, value: value[k], target: targets[k] }));
}

/* ---------- achievements ---------- */
type Metric = "streak" | "words" | "reviews" | "lessons" | "mastered" | "xp";
export const ACHIEVEMENTS: { code: string; metric: Metric; target: number; icon: string }[] = [
  { code: "streak_3", metric: "streak", target: 3, icon: "🔥" },
  { code: "streak_7", metric: "streak", target: 7, icon: "🔥" },
  { code: "streak_30", metric: "streak", target: 30, icon: "🏆" },
  { code: "lessons_1", metric: "lessons", target: 1, icon: "📖" },
  { code: "lessons_10", metric: "lessons", target: 10, icon: "📚" },
  { code: "lessons_50", metric: "lessons", target: 50, icon: "🎓" },
  { code: "words_10", metric: "words", target: 10, icon: "⭐" },
  { code: "words_100", metric: "words", target: 100, icon: "🌟" },
  { code: "words_500", metric: "words", target: 500, icon: "💫" },
  { code: "reviews_100", metric: "reviews", target: 100, icon: "🧠" },
  { code: "reviews_1000", metric: "reviews", target: 1000, icon: "🧠" },
  { code: "mastered_50", metric: "mastered", target: 50, icon: "💎" },
  { code: "xp_1000", metric: "xp", target: 1000, icon: "⚡" },
  { code: "xp_10000", metric: "xp", target: 10000, icon: "👑" },
];

/** Store progress and unlock dates (an unlocked badge stays unlocked), then return everything for display. */
export async function syncAchievements(m: Omit<Record<Metric, number>, "reviews">) {
  const db = getDb();
  const uid = await myId();
  const [[r], rows] = await Promise.all([db.select({ n: count() }).from(reviewLogs).where(eq(reviewLogs.userId, uid)), db.select().from(achievements).where(eq(achievements.userId, uid))]);
  const values: Record<Metric, number> = { ...m, reviews: r.n };
  const saved = new Map(rows.map((x) => [x.code, x]));
  const now = new Date();
  const out = [];
  for (const a of ACHIEVEMENTS) {
    const progress = Math.min(values[a.metric], a.target);
    const unlockedAt = saved.get(a.code)?.unlockedAt ?? (progress >= a.target ? now : null);
    if (saved.get(a.code)?.progress !== progress || (unlockedAt && !saved.get(a.code)?.unlockedAt)) {
      await db.insert(achievements).values({ userId: uid, code: a.code, progress, unlockedAt }).onDuplicateKeyUpdate({ set: { progress, unlockedAt } });
    }
    out.push({ ...a, progress, unlockedAt });
  }
  return out;
}
