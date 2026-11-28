/**
 * Where saved words come from, as ready-made sets: the user's own sets, each reading text, each listening video,
 * each IELTS test (book · test, listening and reading together) and "other words" (dictionary, added by hand).
 * A source key ("set:3", "text:7", "listen:12", "ielts:5", "other") filters the notebook and the practice page.
 */
import { and, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
import { LEARNED_DAYS } from "@/lib/review";
import { CARD_FIELDS, deleteSet, listSets, saveTextSet, textSets, upsertCards, withImages, type SetCard } from "@/lib/sets";
import type { z } from "zod";

const { words, wordSets, wordSetItems, lessons, listenSources, ieltsSections, ieltsTests, ieltsBooks } = schema;

export type SourceKind = "set" | "text" | "listen" | "ielts" | "other";
export type Source = { key: string; kind: SourceKind; title: string; n: number };

/** Words in none of the user's sets and from no text, recording or test. */
const otherWords = (uid: number) =>
  and(
    isNull(words.lessonId),
    isNull(words.listenSourceId),
    isNull(words.ieltsSectionId),
    sql`${words.id} not in (select i.word_id from ${wordSetItems} i join ${wordSets} s on s.id = i.set_id where s.user_id = ${uid})`,
  );

/** The words of one source, as a condition on `words`; undefined for an unknown key (= all words). */
export function sourceWhere(key: string | undefined, uid: number): SQL | undefined {
  if (!key) return undefined;
  if (key === "other") return otherWords(uid);
  const [kind, raw] = key.split(":");
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return undefined;
  if (kind === "set") return sql`${words.id} in (select i.word_id from ${wordSetItems} i join ${wordSets} s on s.id = i.set_id where s.id = ${id} and s.user_id = ${uid})`;
  if (kind === "text") return sql`${words.lessonId} in (select l.id from ${lessons} l where l.document_id = ${id})`;
  if (kind === "listen") return eq(words.listenSourceId, id);
  if (kind === "ielts")
    return sql`(${words.ieltsSectionId} in (select s.id from ${ieltsSections} s where s.test_id = ${id})
      or ${words.listenSourceId} in (select ls.id from ${listenSources} ls join ${ieltsSections} s on s.id = ls.section_id where s.test_id = ${id}))`;
  return undefined;
}

/** Every source with its number of words, in groups: own sets, texts, videos, IELTS tests, other words. */
export async function notebookSources(): Promise<Source[]> {
  const db = getDb();
  const uid = await myId();
  const mine = eq(words.userId, uid);
  const [sets, texts, videos, ieltsRead, ieltsHeard, [other]] = await Promise.all([
    listSets(),
    textSets(),
    db
      .select({ id: listenSources.id, title: listenSources.title, n: count() })
      .from(words)
      .innerJoin(listenSources, eq(listenSources.id, words.listenSourceId))
      .where(and(mine, eq(listenSources.kind, "youtube")))
      .groupBy(listenSources.id, listenSources.title)
      .orderBy(desc(sql`max(${words.id})`)),
    db
      .select({ id: ieltsTests.id, book: ieltsBooks.title, test: ieltsTests.title, n: count() })
      .from(words)
      .innerJoin(ieltsSections, eq(ieltsSections.id, words.ieltsSectionId))
      .innerJoin(ieltsTests, eq(ieltsTests.id, ieltsSections.testId))
      .innerJoin(ieltsBooks, eq(ieltsBooks.id, ieltsTests.bookId))
      .where(mine)
      .groupBy(ieltsTests.id, ieltsBooks.title, ieltsTests.title),
    db
      .select({ id: ieltsTests.id, book: ieltsBooks.title, test: ieltsTests.title, n: count() })
      .from(words)
      .innerJoin(listenSources, eq(listenSources.id, words.listenSourceId))
      .innerJoin(ieltsSections, eq(ieltsSections.id, listenSources.sectionId))
      .innerJoin(ieltsTests, eq(ieltsTests.id, ieltsSections.testId))
      .innerJoin(ieltsBooks, eq(ieltsBooks.id, ieltsTests.bookId))
      .where(mine)
      .groupBy(ieltsTests.id, ieltsBooks.title, ieltsTests.title),
    db.select({ n: count() }).from(words).where(and(mine, otherWords(uid))),
  ]);
  // one IELTS test = one source, whether its words came from listening or reading
  const tests = new Map<number, { title: string; n: number }>();
  for (const r of [...ieltsRead, ...ieltsHeard]) tests.set(r.id, { title: `${r.book} · ${r.test}`, n: (tests.get(r.id)?.n ?? 0) + r.n });
  return [
    ...sets.map((s) => ({ key: `set:${s.id}`, kind: "set" as const, title: s.title, n: s.n })),
    ...texts.map((d) => ({ key: `text:${d.id}`, kind: "text" as const, title: d.title, n: d.n })),
    ...videos.map((v) => ({ key: `listen:${v.id}`, kind: "listen" as const, title: v.title, n: v.n })),
    ...[...tests].sort((a, b) => a[1].title.localeCompare(b[1].title, undefined, { numeric: true })).map(([id, x]) => ({ key: `ielts:${id}`, kind: "ielts" as const, title: x.title, n: x.n })),
    ...(other.n ? [{ key: "other", kind: "other" as const, title: "", n: other.n }] : []),
  ];
}

/** How many of the words (of one source, or all) are due, new, learning and learned. */
export async function statusCounts(source: string | undefined) {
  const uid = await myId();
  const [r] = await getDb()
    .select({
      all: count(),
      due: sql<number>`sum(${words.state} > 0 and ${words.due} <= now(3))`,
      new: sql<number>`sum(${words.state} = 0)`,
      learned: sql<number>`sum(${words.state} = 2 and ${words.scheduledDays} >= ${LEARNED_DAYS})`,
    })
    .from(words)
    .where(and(eq(words.userId, uid), sourceWhere(source, uid)));
  const n = (v: unknown) => Number(v ?? 0);
  return { all: n(r.all), due: n(r.due), new: n(r.new), learned: n(r.learned), learning: n(r.all) - n(r.new) - n(r.learned) };
}

/** Add words to one of the user's sets (after its last card), or take them out of it. */
export async function setItems(setId: number, wordIds: number[], remove = false) {
  const db = getDb();
  const uid = await myId();
  const [own] = await db.select({ id: wordSets.id }).from(wordSets).where(and(eq(wordSets.id, setId), eq(wordSets.userId, uid)));
  if (!own) return false;
  const ids = (await db.select({ id: words.id }).from(words).where(and(eq(words.userId, uid), inArray(words.id, [...new Set(wordIds)])))).map((w) => w.id);
  if (!ids.length) return true;
  if (remove) {
    await db.delete(wordSetItems).where(and(eq(wordSetItems.setId, setId), inArray(wordSetItems.wordId, ids)));
    return true;
  }
  const have = (await db.select({ w: wordSetItems.wordId, p: wordSetItems.position }).from(wordSetItems).where(eq(wordSetItems.setId, setId)));
  const next = have.reduce((m, x) => Math.max(m, x.p + 1), 0);
  const fresh = ids.filter((id) => !have.some((h) => h.w === id));
  if (fresh.length) await db.insert(wordSetItems).values(fresh.map((wordId, k) => ({ setId, wordId, position: next + k })));
  await db.update(wordSets).set({ updatedAt: new Date() }).where(eq(wordSets.id, setId));
  return true;
}

/** The words of an automatic set (video, IELTS test, other words) for the set editor, oldest first. */
export async function sourceCards(key: string) {
  const uid = await myId();
  const where = sourceWhere(key, uid);
  const source = (await notebookSources()).find((s) => s.key === key);
  if (!where || !source || !["listen", "ielts", "other"].includes(source.kind)) return null;
  const cards = await getDb().select(CARD_FIELDS).from(words).where(and(eq(words.userId, uid), where)).orderBy(words.id);
  return { title: source.title, cards: await withImages(cards) };
}

const wordIdsOf = async (key: string, uid: number) => (await getDb().select({ id: words.id }).from(words).where(and(eq(words.userId, uid), sourceWhere(key, uid)))).map((w) => w.id);

/** Leave a video or IELTS test (or a text): the words stay in the notebook, under "other words" unless in a set. */
async function detach(key: string, ids: number[], uid: number) {
  if (!ids.length) return;
  const db = getDb();
  const mine = and(eq(words.userId, uid), inArray(words.id, ids));
  const [kind, raw] = key.split(":");
  if (kind === "text") await db.update(words).set({ lessonId: null }).where(mine);
  if (kind === "listen") await db.update(words).set({ listenSourceId: null }).where(mine);
  if (kind === "ielts") await db.update(words).set({ ieltsSectionId: null, listenSourceId: sql`if(${words.listenSourceId} in (select ls.id from ${listenSources} ls join ${ieltsSections} s on s.id = ls.section_id where s.test_id = ${Number(raw)}), null, ${words.listenSourceId})` }).where(mine);
}

/**
 * Save an automatic set from the set editor: edited cards are updated, new ones become words of that video / test,
 * cards taken out leave it (into "other words"); for "other words" a card taken out is deleted.
 */
export async function saveSourceSet(key: string, cards: z.infer<typeof SetCard>[]) {
  const uid = await myId();
  if (key.startsWith("text:")) return saveTextSet(Number(key.slice(5)), cards);
  const source = (await notebookSources()).find((s) => s.key === key);
  if (!source || !["listen", "ielts", "other"].includes(source.kind)) return null;
  const db = getDb();
  const before = await wordIdsOf(key, uid);
  const ids = await upsertCards(cards);
  const fresh = ids.filter((id) => !before.includes(id));
  const gone = before.filter((id) => !ids.includes(id));
  const [kind, raw] = key.split(":");
  if (fresh.length && kind === "listen") await db.update(words).set({ listenSourceId: Number(raw) }).where(and(eq(words.userId, uid), inArray(words.id, fresh)));
  if (fresh.length && kind === "ielts") {
    const [first] = await db.select({ id: ieltsSections.id }).from(ieltsSections).where(eq(ieltsSections.testId, Number(raw))).orderBy(ieltsSections.skill, ieltsSections.part).limit(1);
    if (first) await db.update(words).set({ ieltsSectionId: first.id }).where(and(eq(words.userId, uid), inArray(words.id, fresh)));
  }
  if (gone.length) {
    if (kind === "other") await db.delete(words).where(and(eq(words.userId, uid), inArray(words.id, gone)));
    else await detach(key, gone, uid);
  }
  return { id: 0, wordIds: ids };
}

/** Delete a set: your own set goes (its words stay); an automatic one lets its words go to "other words";
 *  "other words" deletes those words. */
export async function deleteSource(key: string) {
  const uid = await myId();
  if (key.startsWith("set:")) return void (await deleteSet(Number(key.slice(4))));
  const ids = await wordIdsOf(key, uid);
  if (key === "other") {
    if (ids.length) await getDb().delete(words).where(and(eq(words.userId, uid), inArray(words.id, ids)));
    return;
  }
  await detach(key, ids, uid);
}

