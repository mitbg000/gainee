/** Spaced repetition of saved words with FSRS (ts-fsrs). */
import { and, asc, count, eq, lte, sql } from "drizzle-orm";
import { fsrs, type Card, type Grade } from "ts-fsrs";
import { getDb, schema } from "@/db";
import { addXp, bumpActivity } from "./activity";
import { imagesForWords } from "./images";

const { words, lessons, documents, reviewLogs } = schema;
const scheduler = fsrs({ enable_fuzz: true });
export const REVIEW_MODES = ["recognize", "recall", "cloze", "listen"] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

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

const dueFilter = (documentId?: number) =>
  and(eq(words.suspended, false), lte(words.due, new Date()), documentId ? eq(lessons.documentId, documentId) : undefined);

/** Words due now (oldest first), optionally only from one text. */
export async function dueWords(documentId?: number, limit = 50) {
  const rows = await getDb()
    .select({
      id: words.id,
      term: words.term,
      ipa: words.ipa,
      pos: words.pos,
      meaningVi: words.meaningVi,
      definitionEn: words.definitionEn,
      example: words.example,
      note: words.note,
      context: words.context,
      state: words.state,
    })
    .from(words)
    .leftJoin(lessons, eq(words.lessonId, lessons.id))
    .where(dueFilter(documentId))
    .orderBy(asc(words.due))
    .limit(limit);
  const images = await imagesForWords(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, images: (images.get(r.id) ?? []).map((i) => i.url) }));
}

/** Due counts per text (texts without due words are left out); `null` id = words not tied to a text. */
export async function dueByDocument() {
  return getDb()
    .select({ id: documents.id, title: documents.title, n: count() })
    .from(words)
    .leftJoin(lessons, eq(words.lessonId, lessons.id))
    .leftJoin(documents, eq(lessons.documentId, documents.id))
    .where(dueFilter())
    .groupBy(documents.id, documents.title)
    .orderBy(sql`count(*) desc`);
}

/** Apply a rating (1 Again … 4 Easy), log it, and return the next due date. */
export async function gradeWord(id: number, rating: Grade, mode: ReviewMode, durationMs?: number) {
  const db = getDb();
  const [w] = await db.select().from(words).where(eq(words.id, id));
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
  await db.insert(reviewLogs).values({ wordId: id, rating, mode, stateBefore: w.state, durationMs: durationMs ?? null });
  await bumpActivity({ reviews: 1 });
  await addXp("review", 1, { type: "word", id });
  return { due: card.due };
}
