/** Vocabulary notebook writes (Phase 2 adds the notebook page and FSRS reviews). */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
import { addXp, bumpActivity, XP } from "./activity";
import { chat } from "./ai/client";
import { CARD_RULES } from "./ai/prompts";

const { words, lessonVocab, lessons, documents, documentLabels, wordLabels } = schema;

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
    listenSourceId: z.number().int().positive().optional(),
  }),
]);

/** Create a word card. Words from a lesson inherit the categories of its text. */
export async function addWord(input: z.infer<typeof WordInput>): Promise<number> {
  const db = getDb();
  const uid = await myId();
  let values: typeof words.$inferInsert;
  if ("lessonVocabId" in input) {
    const [v] = await db.select().from(lessonVocab).where(eq(lessonVocab.id, input.lessonVocabId));
    if (!v) throw new Error("not_found");
    const [existing] = await db.select({ id: words.id }).from(words).where(and(eq(words.userId, uid), eq(words.lessonVocabId, v.id)));
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
      const [dup] = await db.select({ id: words.id }).from(words).where(and(eq(words.userId, uid), eq(words.term, input.term), eq(words.lessonId, input.lessonId)));
      if (dup) return dup.id;
    }
    if (input.listenSourceId) {
      const [dup] = await db.select({ id: words.id }).from(words).where(and(eq(words.userId, uid), eq(words.term, input.term), eq(words.listenSourceId, input.listenSourceId)));
      if (dup) return dup.id;
    }
    values = { term: input.term, ipa: input.ipa || null, pos: input.pos || null, meaningVi: input.meaningVi || null, definitionEn: input.definitionEn || null, example: input.example || null, context: input.context || null, note: input.note || null, lessonId: input.lessonId ?? null, listenSourceId: input.listenSourceId ?? null };
  }
  const [{ id }] = await db.insert(words).values({ ...values, userId: uid }).$returningId();
  if (values.lessonId) {
    const [l] = await db
      .select({ documentId: lessons.documentId, ownerId: documents.userId })
      .from(lessons)
      .innerJoin(documents, eq(documents.id, lessons.documentId))
      .where(eq(lessons.id, values.lessonId));
    if (l && l.ownerId === uid) { // a shared text's labels are its owner's
      const labels = await db.select({ labelId: documentLabels.labelId }).from(documentLabels).where(eq(documentLabels.documentId, l.documentId));
      if (labels.length) await db.insert(wordLabels).values(labels.map((x) => ({ wordId: id, labelId: x.labelId })));
    }
  }
  await bumpActivity({ wordsAdded: 1 });
  await addXp("word_saved", XP.wordSaved, { type: "word", id });
  return id;
}

export async function removeWord(id: number) {
  await getDb().delete(words).where(and(eq(words.id, id), eq(words.userId, await myId())));
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
  await getDb().update(words).set(set).where(and(eq(words.id, id), eq(words.userId, await myId())));
}

/**
 * Rewrite a saved word as a short flashcard (one sense, few words) with AI. Returns the new fields;
 * saves them too when `save` is set. Term, IPA and the sentence it came from are kept.
 */
export async function shortenWord(id: number, save: boolean) {
  const [w] = await getDb().select().from(words).where(and(eq(words.id, id), eq(words.userId, await myId())));
  if (!w) return null;
  const r = await chat({
    task: "reader_quick",
    json: true,
    temperature: 0.2,
    maxTokens: 400,
    messages: [
      { role: "system", content: "You tidy vocabulary flashcards for a Vietnamese IELTS learner. Reply with ONE JSON object only." },
      {
        role: "user",
        content: `Word: "${w.term}"${w.context ? `\nSentence it was saved from: "${w.context}"` : ""}
Current card (may be long or messy, copied from a dictionary):
${JSON.stringify({ pos: w.pos, meaningVi: w.meaningVi, definitionEn: w.definitionEn, example: w.example, note: w.note })}
Rewrite it for the sense used in the sentence (or the most common sense if there is no sentence). JSON keys (strings): {"pos":"n. | v. | adj. | adv. | phr.v. | idiom …","meaningVi":"","definitionEn":"","example":"","note":""}
${CARD_RULES}`,
      },
    ],
  });
  const o = JSON.parse(/\{[\s\S]*\}/.exec(r.text)?.[0] ?? "{}") as Record<string, unknown>;
  const s = (k: string, max: number) => (typeof o[k] === "string" ? (o[k] as string).trim().slice(0, max) : undefined);
  const card = { pos: s("pos", 32), meaningVi: s("meaningVi", 500), definitionEn: s("definitionEn", 2000), example: s("example", 2000), note: s("note", 2000) };
  if (!card.meaningVi) throw new Error("bad_response");
  if (save) await updateWord(id, card);
  return card;
}
