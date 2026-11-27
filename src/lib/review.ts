/** Spaced repetition of saved words with FSRS (ts-fsrs). */
import { and, asc, count, desc, eq, gt, isNotNull, lte, notInArray, or, sql } from "drizzle-orm";
import { fsrs, type Card, type Grade } from "ts-fsrs";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
import { addXp, bumpActivity } from "./activity";
import { imagesForWords } from "./images";

const { words, lessons, documents, reviewLogs } = schema;
const scheduler = fsrs({ enable_fuzz: true });
export const REVIEW_MODES = ["recognize", "recall", "cloze", "listen", "image"] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];
/** Also logged as reviews: writing a sentence with the word, meeting it in a review passage. */
export type LogMode = ReviewMode | "sentence" | "passage";

type WordRow = typeof words.$inferSelect;

// shortcut: ts-fsrs ≥5 dropped elapsed_days and added learning_steps, so the old elapsed_days column stores learning_steps.
function toCard(w: WordRow): Card {
  return {
    due: w.due,
    stability: w.stability,
    difficulty: w.difficulty,
    scheduled_days: w.scheduledDays,
    learning_steps: w.elapsedDays,
    reps: w.reps,
    lapses: w.lapses,
    state: w.state,
    last_review: w.lastReview ?? undefined,
  } as Card;
}

/** Time until the card is due again for each rating (Again, Hard, Good, Easy), in ms – shown on the rating buttons like Anki. */
function preview(c: Card, now = new Date()) {
  const r = scheduler.repeat(c, now);
  return ([1, 2, 3, 4] as Grade[]).map((g) => r[g].card.due.getTime() - now.getTime());
}

const dueFilter = (uid: number, documentId?: number) =>
  and(eq(words.userId, uid), eq(words.suspended, false), lte(words.due, new Date()), documentId ? eq(lessons.documentId, documentId) : undefined);

/** Words due now (oldest first), optionally only from one text. */
export async function dueWords(documentId?: number, limit = 50) {
  const rows = await getDb()
    .select({ w: words })
    .from(words)
    .leftJoin(lessons, eq(words.lessonId, lessons.id))
    .where(dueFilter(await myId(), documentId))
    .orderBy(asc(words.due))
    .limit(limit);
  const images = await imagesForWords(rows.map((r) => r.w.id));
  return rows.map(({ w }) => ({
    id: w.id,
    term: w.term,
    ipa: w.ipa,
    pos: w.pos,
    meaningVi: w.meaningVi,
    definitionEn: w.definitionEn,
    example: w.example,
    note: w.note,
    mnemonic: w.mnemonic,
    context: w.context,
    state: w.state,
    next: preview(toCard(w)),
    images: (images.get(w.id) ?? []).map((i) => i.url),
  }));
}

/** Words that fall due within the next day (not yet due now) – "tomorrow" on the review page. */
export async function dueSoon() {
  const [r] = await getDb()
    .select({ n: count() })
    .from(words)
    .where(and(eq(words.userId, await myId()), eq(words.suspended, false), gt(words.due, new Date()), lte(words.due, new Date(Date.now() + 24 * 3600_000))));
  return r?.n ?? 0;
}

/** Due counts per text (texts without due words are left out); `null` id = words not tied to a text. */
export async function dueByDocument() {
  return getDb()
    .select({ id: documents.id, title: documents.title, n: count() })
    .from(words)
    .leftJoin(lessons, eq(words.lessonId, lessons.id))
    .leftJoin(documents, eq(lessons.documentId, documents.id))
    .where(dueFilter(await myId()))
    .groupBy(documents.id, documents.title)
    .orderBy(sql`count(*) desc`);
}

/** Apply a rating (1 Again … 4 Easy), log it, and return the next due date. */
export async function gradeWord(id: number, rating: Grade, mode: LogMode, durationMs?: number) {
  const db = getDb();
  const uid = await myId();
  const [w] = await db.select().from(words).where(and(eq(words.id, id), eq(words.userId, uid)));
  if (!w) return null;
  const now = new Date();
  const { card } = scheduler.next(toCard(w), now, rating);
  await db
    .update(words)
    .set({
      due: card.due,
      stability: card.stability,
      difficulty: card.difficulty,
      scheduledDays: card.scheduled_days,
      elapsedDays: card.learning_steps,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      lastReview: now,
    })
    .where(eq(words.id, id));
  await db.insert(reviewLogs).values({ userId: uid, wordId: id, rating, mode, stateBefore: w.state, durationMs: durationMs ?? null });
  await bumpActivity({ reviews: 1 });
  await addXp("review", 1, { type: "word", id });
  return { due: card.due, state: card.state, next: preview(card, now) };
}

/** Number of words due now (badge in the top bar). */
export async function dueCount() {
  const [r] = await getDb().select({ n: count() }).from(words).where(and(eq(words.userId, await myId()), eq(words.suspended, false), lte(words.due, new Date())));
  return r?.n ?? 0;
}

/** Days until the next review from which a word counts as learned: remembered after three weeks (~90 % by FSRS). */
export const LEARNED_DAYS = 21;

/**
 * Words for one quick round. "learn": new words, the latest saved first. "review": words due now, the most overdue
 * first (FSRS decides when). Each with what is needed to ask about it.
 */
export async function quickWords(kind: "learn" | "review", size = 10, skip: number[] = []) {
  const db = getDb();
  const uid = await myId();
  // skip: words of the rounds already done in this sitting ("Study more" gives other words)
  const base = and(eq(words.userId, uid), eq(words.suspended, false), or(isNotNull(words.meaningVi), isNotNull(words.definitionEn)), skip.length ? notInArray(words.id, skip) : undefined);
  const rows =
    kind === "learn"
      ? await db.select().from(words).where(and(base, eq(words.state, 0))).orderBy(desc(words.id)).limit(size)
      : await db.select().from(words).where(and(base, gt(words.state, 0), lte(words.due, new Date()))).orderBy(asc(words.due)).limit(size);
  // other saved words: wrong options for the questions
  const others = await db
    .select({ term: words.term, pos: words.pos, meaningVi: words.meaningVi, definitionEn: words.definitionEn })
    .from(words)
    .where(and(base, notInArray(words.id, rows.length ? rows.map((r) => r.id) : [0])))
    .orderBy(desc(words.id))
    .limit(300);
  return {
    words: rows.map((w) => ({
      id: w.id,
      term: w.term,
      ipa: w.ipa,
      pos: w.pos,
      meaningVi: w.meaningVi,
      definitionEn: w.definitionEn,
      context: w.context,
      example: w.example,
      state: w.state,
      stability: w.stability,
    })),
    others,
  };
}

/** How many words wait in each part, and when the next review falls due (for the choice screen). */
export async function quickCounts() {
  const db = getDb();
  const uid = await myId();
  const base = and(eq(words.userId, uid), eq(words.suspended, false), or(isNotNull(words.meaningVi), isNotNull(words.definitionEn)));
  const [[fresh], [due], [next], [learned]] = await Promise.all([
    db.select({ n: count() }).from(words).where(and(base, eq(words.state, 0))),
    db.select({ n: count() }).from(words).where(and(base, gt(words.state, 0), lte(words.due, new Date()))),
    db.select({ at: sql<Date | null>`MIN(${words.due})` }).from(words).where(and(base, gt(words.state, 0), gt(words.due, new Date()))),
    db.select({ n: count() }).from(words).where(and(base, eq(words.state, 2), sql`${words.scheduledDays} >= ${LEARNED_DAYS}`)),
  ]);
  return { fresh: fresh.n, due: due.n, nextDue: next.at ? new Date(next.at) : null, learned: learned.n };
}
