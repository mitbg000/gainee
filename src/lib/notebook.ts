/**
 * Where saved words come from, as ready-made sets: the user's own sets, each reading text, each listening video,
 * each IELTS test (book · test, listening and reading together) and "other words" (dictionary, added by hand).
 * A source key ("set:3", "text:7", "listen:12", "ielts:5", "other") filters the notebook and the practice page.
 */
import { and, count, desc, eq, gt, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
import { LEARNED_DAYS } from "@/lib/review";
import { listSets, textSets } from "@/lib/sets";

const { words, wordSets, wordSetItems, lessons, listenSources, ieltsSections, ieltsTests, ieltsBooks } = schema;

export type SourceKind = "set" | "text" | "listen" | "ielts" | "other";
export type Source = { key: string; kind: SourceKind; title: string; n: number };
export const STATUSES = ["due", "new", "learning", "learned"] as const;
export type Status = (typeof STATUSES)[number];

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

/** A status (from the review schedule) as a condition on `words`. */
export function statusWhere(status: string | undefined): SQL | undefined {
  if (status === "due") return and(gt(words.state, 0), lte(words.due, new Date()));
  if (status === "new") return eq(words.state, 0);
  if (status === "learned") return and(eq(words.state, 2), sql`${words.scheduledDays} >= ${LEARNED_DAYS}`);
  if (status === "learning") return and(gt(words.state, 0), sql`not (${words.state} = 2 and ${words.scheduledDays} >= ${LEARNED_DAYS})`);
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
