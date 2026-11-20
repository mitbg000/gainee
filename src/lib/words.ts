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
    meaningVi: z.string().trim().max(500).optional(),
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
    values = { term: input.term, meaningVi: input.meaningVi || null, context: input.context || null, note: input.note || null, lessonId: input.lessonId ?? null };
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
