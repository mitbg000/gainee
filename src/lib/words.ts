/** Vocabulary notebook writes (Phase 2 adds the notebook page and FSRS reviews). */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { addXp, bumpActivity, XP } from "./activity";

const { words, lessonVocab, lessons, documentLabels, wordLabels } = schema;

export const WordInput = z.union([
  z.object({ lessonVocabId: z.number().int().positive() }),
  z.object({
    term: z.string().trim().min(1).max(191),
    ipa: z.string().trim().max(191).optional(),
    pos: z.string().trim().max(32).optional(),
    meaningVi: z.string().trim().max(500).optional(),
    definitionEn: z.string().max(2000).optional(),
    example: z.string().max(2000).optional(),
    context: z.string().max(2000).optional(),
    note: z.string().max(2000).optional(),
    lessonId: z.number().int().positive().optional(),
  }),
]);

/** Create a word card. Words from a lesson inherit the categories of its text. */
export async function addWord(input: z.infer<typeof WordInput>): Promise<number> {
  const db = getDb();
  let values: typeof words.$inferInsert;
  if ("lessonVocabId" in input) {
    const [v] = await db.select().from(lessonVocab).where(eq(lessonVocab.id, input.lessonVocabId));
    if (!v) throw new Error("not_found");
    const [existing] = await db.select({ id: words.id }).from(words).where(eq(words.lessonVocabId, v.id));
    if (existing) return existing.id;
    values = {
      term: v.headword,
      ipa: v.ipa,
      pos: v.pos,
      meaningVi: v.meaningVi,
      definitionEn: v.definitionEn,
      context: v.context,
      example: v.example,
      note: v.note,
      lessonId: v.lessonId,
      lessonVocabId: v.id,
    };
  } else {
    if (input.lessonId) {
      const [dup] = await db.select({ id: words.id }).from(words).where(and(eq(words.term, input.term), eq(words.lessonId, input.lessonId)));
      if (dup) return dup.id;
    }
    values = { term: input.term, ipa: input.ipa || null, pos: input.pos || null, meaningVi: input.meaningVi || null, definitionEn: input.definitionEn || null, example: input.example || null, context: input.context || null, note: input.note || null, lessonId: input.lessonId ?? null };
  }
  const [{ id }] = await db.insert(words).values(values).$returningId();
  if (values.lessonId) {
    const [l] = await db.select({ documentId: lessons.documentId }).from(lessons).where(eq(lessons.id, values.lessonId));
    if (l) {
      const labels = await db.select({ labelId: documentLabels.labelId }).from(documentLabels).where(eq(documentLabels.documentId, l.documentId));
      if (labels.length) await db.insert(wordLabels).values(labels.map((x) => ({ wordId: id, labelId: x.labelId })));
    }
  }
  await bumpActivity({ wordsAdded: 1 });
  await addXp("word_saved", XP.wordSaved, { type: "word", id });
  return id;
}

export async function removeWord(id: number) {
  await getDb().delete(words).where(eq(words.id, id));
}

export const WordPatch = z.object({
  term: z.string().trim().min(1).max(191),
  ipa: z.string().trim().max(191),
  pos: z.string().trim().max(32),
  meaningVi: z.string().trim().max(500),
  definitionEn: z.string().max(2000),
  example: z.string().max(2000),
  note: z.string().max(2000),
  context: z.string().max(2000),
}).partial();

/** Edit a saved word; empty strings clear optional fields. */
export async function updateWord(id: number, patch: z.infer<typeof WordPatch>) {
  const { term, ...rest } = patch;
  const set: Partial<typeof words.$inferInsert> = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v]));
  if (term) set.term = term;
  if (!Object.keys(set).length) return;
  await getDb().update(words).set(set).where(eq(words.id, id));
}
