/** Study sets ("học phần"): named, ordered groups of saved words, edited like Quizlet sets. */
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
import { imagesForWords } from "./images";
import { addWord, updateWord } from "./words";

const { words, wordSets, wordSetItems, lessons, documents } = schema;

export const CARD_FIELDS = { id: words.id, term: words.term, ipa: words.ipa, pos: words.pos, meaningVi: words.meaningVi, definitionEn: words.definitionEn, example: words.example, note: words.note, context: words.context, lapses: words.lapses, reps: words.reps, state: words.state, scheduledDays: words.scheduledDays, due: words.due };

/** All sets with their size, most recently changed first. */
export async function listSets() {
  return getDb()
    .select({ id: wordSets.id, title: wordSets.title, description: wordSets.description, updatedAt: wordSets.updatedAt, n: sql<number>`(select count(*) from ${wordSetItems} i where i.set_id = \`word_sets\`.\`id\`)` })
    .from(wordSets)
    .where(eq(wordSets.userId, await myId()))
    .orderBy(desc(wordSets.updatedAt))
    .then((r) => r.map((s) => ({ ...s, n: Number(s.n) })));
}

/** Words saved from each reading text: shown as ready-made sets. */
export async function textSets() {
  return getDb()
    .select({ id: documents.id, title: documents.title, n: count() })
    .from(words)
    .innerJoin(lessons, eq(words.lessonId, lessons.id))
    .innerJoin(documents, eq(lessons.documentId, documents.id))
    .where(eq(words.userId, await myId()))
    .groupBy(documents.id, documents.title)
    .orderBy(desc(sql`max(${words.id})`));
}

async function withImages<T extends { id: number }>(cards: T[]) {
  const imgs = await imagesForWords(cards.map((c) => c.id));
  return cards.map((c) => ({ ...c, images: imgs.get(c.id) ?? [] }));
}

export async function getSet(id: number) {
  const db = getDb();
  const [set] = await db.select().from(wordSets).where(and(eq(wordSets.id, id), eq(wordSets.userId, await myId())));
  if (!set) return null;
  const cards = await db.select(CARD_FIELDS).from(wordSetItems).innerJoin(words, eq(words.id, wordSetItems.wordId)).where(eq(wordSetItems.setId, id)).orderBy(asc(wordSetItems.position));
  return { ...set, cards: await withImages(cards) };
}

export async function getTextSet(documentId: number) {
  const db = getDb();
  const [doc] = await db.select({ id: documents.id, title: documents.title }).from(documents).where(eq(documents.id, documentId));
  if (!doc) return null;
  const cards = await db.select(CARD_FIELDS).from(words).innerJoin(lessons, eq(words.lessonId, lessons.id)).where(and(eq(words.userId, await myId()), eq(lessons.documentId, documentId))).orderBy(asc(lessons.position), asc(words.id));
  return { ...doc, cards: await withImages(cards) };
}

/** One row of the set editor: an existing word (id) with possibly edited fields, or a new card. */
export const SetCard = z.object({
  id: z.number().int().positive().optional(),
  term: z.string().trim().min(1).max(191),
  meaningVi: z.string().trim().max(500).optional(),
  ipa: z.string().trim().max(191).optional(),
  pos: z.string().trim().max(32).optional(),
  example: z.string().max(2000).optional(),
});
export const SetInput = z.object({
  title: z.string().trim().min(1).max(191),
  description: z.string().trim().max(1000).optional(),
  cards: z.array(SetCard).max(1000).optional(),
  wordIds: z.array(z.number().int().positive()).max(5000).optional(),
});

/** Update edited cards and save new ones as words (of `lessonId` when given); returns the word ids in card order. */
async function upsertCards(cards: z.infer<typeof SetCard>[], lessonId?: number) {
  const ids: number[] = [];
  for (const c of cards) {
    // only the fields the editor sent; "" clears one
    const fields = Object.fromEntries(Object.entries({ term: c.term, meaningVi: c.meaningVi, ipa: c.ipa, pos: c.pos, example: c.example }).filter(([, v]) => v !== undefined));
    if (c.id) {
      await updateWord(c.id, fields);
      ids.push(c.id);
    } else ids.push(await addWord({ term: c.term, meaningVi: c.meaningVi, ipa: c.ipa, pos: c.pos, example: c.example, lessonId }));
  }
  return ids;
}

/** Create or replace a set: new cards become saved words, edited ones are updated, order is kept.
 *  Returns the set id and the word id of each card (same order), so the editor can attach images to new cards. */
export async function saveSet(id: number | null, input: z.infer<typeof SetInput>) {
  const db = getDb();
  const uid = await myId();
  const meta = { title: input.title, description: input.description || null };
  let setId = id;
  if (setId) {
    const [own] = await db.select({ id: wordSets.id }).from(wordSets).where(and(eq(wordSets.id, setId), eq(wordSets.userId, uid)));
    if (!own) throw new Error("not_found");
    await db.update(wordSets).set(meta).where(eq(wordSets.id, setId));
  } else [{ id: setId }] = await db.insert(wordSets).values({ ...meta, userId: uid }).$returningId();

  const ids = input.cards ? await upsertCards(input.cards) : input.wordIds;
  if (ids) {
    const unique = [...new Set(ids)];
    const existing = unique.length ? (await db.select({ id: words.id }).from(words).where(and(eq(words.userId, uid), inArray(words.id, unique)))).map((w) => w.id) : [];
    await db.transaction(async (tx) => {
      await tx.delete(wordSetItems).where(eq(wordSetItems.setId, setId!));
      const rows = unique.filter((w) => existing.includes(w)).map((wordId, position) => ({ setId: setId!, wordId, position }));
      if (rows.length) await tx.insert(wordSetItems).values(rows);
    });
  }
  return { id: setId!, wordIds: input.cards ? ids! : [] };
}

export const TextSetInput = z.object({ cards: z.array(SetCard).max(1000) });

/**
 * Edit the words of a reading text like a set. New cards (and saved words added to it) belong to the text's first part;
 * a card removed here leaves the text but stays in the notebook (under "other words").
 */
export async function saveTextSet(documentId: number, cards: z.infer<typeof SetCard>[]) {
  const db = getDb();
  const uid = await myId();
  const parts = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.documentId, documentId)).orderBy(asc(lessons.position));
  if (!parts.length) return null;
  const before = (await db.select({ id: words.id }).from(words).where(and(eq(words.userId, uid), inArray(words.lessonId, parts.map((l) => l.id))))).map((w) => w.id);
  const ids = await upsertCards(cards, parts[0].id);
  const moveIn = ids.filter((id) => !before.includes(id));
  const moveOut = before.filter((id) => !ids.includes(id));
  if (moveIn.length) await db.update(words).set({ lessonId: parts[0].id }).where(and(eq(words.userId, uid), inArray(words.id, moveIn)));
  if (moveOut.length) await db.update(words).set({ lessonId: null }).where(and(eq(words.userId, uid), inArray(words.id, moveOut)));
  return { id: documentId, wordIds: ids };
}

export const deleteSet = async (id: number) => getDb().delete(wordSets).where(and(eq(wordSets.id, id), eq(wordSets.userId, await myId())));

/** Every saved word, light, for the "add saved words" picker and quiz distractors. */
export const allWordsLight = async () => getDb().select({ id: words.id, term: words.term, meaningVi: words.meaningVi, definitionEn: words.definitionEn }).from(words).where(eq(words.userId, await myId())).orderBy(desc(words.id)).limit(5000);
