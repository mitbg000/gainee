/**
 * Listening bank: sources (YouTube videos, IELTS Listening parts) cut into sentences; random practice without
 * repeats, a review schedule for sentences once got wrong, and results that feed streak / XP.
 */
import { and, asc, eq, inArray, isNotNull, lte, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { addXp, bumpActivity, XP } from "@/lib/activity";
import { rate, type Clip } from "./segment";

const { listenSources: src, listenItems: items, ieltsSections, ieltsTests, ieltsBooks, words } = schema;

export type Source = typeof src.$inferSelect;
export type Item = typeof items.$inferSelect;
/** What the player needs to play a sentence of any source. */
export type PlayItem = Pick<Item, "id" | "sourceId" | "idx" | "start" | "end" | "text" | "speaker" | "due"> & { media: Media };
export type Media = { kind: "youtube"; youtubeId: string; shift: number } | { kind: "ielts"; audioUrl: string; shift: number };

export async function listSources() {
  const db = getDb();
  const [rows, counts] = await Promise.all([
    db.select().from(src).orderBy(sql`${src.id} desc`),
    db
      .select({
        sourceId: items.sourceId,
        n: sql<number>`count(*)`,
        seen: sql<number>`sum(${items.tries} > 0)`,
        due: sql<number>`sum(${items.due} is not null and ${items.due} <= now(3))`,
        hidden: sql<number>`sum(${items.hidden})`,
        low: sql<number>`sum(${items.confidence} < 0.7)`,
      })
      .from(items)
      .groupBy(items.sourceId),
  ]);
  const by = new Map(counts.map((c) => [c.sourceId, c]));
  return rows.map((s) => {
    const c = by.get(s.id);
    return { ...s, n: Number(c?.n ?? 0), seen: Number(c?.seen ?? 0), due: Number(c?.due ?? 0), hidden: Number(c?.hidden ?? 0), low: Number(c?.low ?? 0) };
  });
}

async function mediaOf(sources: Source[]): Promise<Map<number, Media>> {
  const ids = sources.filter((s) => s.sectionId).map((s) => s.sectionId!);
  const secs = ids.length ? await getDb().select({ id: ieltsSections.id, audio: ieltsSections.audio }).from(ieltsSections).where(inArray(ieltsSections.id, ids)) : [];
  const audio = new Map(secs.map((x) => [x.id, x.audio]));
  const out = new Map<number, Media>();
  for (const s of sources) {
    if (s.kind === "youtube" && s.youtubeId) out.set(s.id, { kind: "youtube", youtubeId: s.youtubeId, shift: s.shift });
    const a = s.sectionId ? audio.get(s.sectionId) : null;
    if (s.kind === "ielts" && a) out.set(s.id, { kind: "ielts", audioUrl: `/api/ielts/audio/${a.fileId}`, shift: s.shift });
  }
  return out;
}

const play = (rows: Item[], media: Map<number, Media>): PlayItem[] =>
  rows.filter((r) => media.has(r.sourceId)).map((r) => ({ id: r.id, sourceId: r.sourceId, idx: r.idx, start: r.start, end: r.end, text: r.text, speaker: r.speaker, due: r.due, media: media.get(r.sourceId)! }));

export async function getSource(id: number) {
  const db = getDb();
  const [s] = await db.select().from(src).where(eq(src.id, id));
  if (!s) return null;
  const rows = await db.select().from(items).where(eq(items.sourceId, id)).orderBy(asc(items.idx));
  const media = await mediaOf([s]);
  const saved = await db.select({ id: words.id, term: words.term }).from(words).where(eq(words.listenSourceId, id));
  return { source: s, items: rows, play: play(rows, media), media: media.get(s.id) ?? null, saved };
}

/** Practice scope: everything, one source, fast speech, sentences with numbers (old "youtube" / "ielts" still read). */
export const SCOPES = ["all", "fast", "numbers"] as const;
function scopeWhere(scope: string): SQL[] {
  const w: SQL[] = [eq(items.hidden, false)];
  const one = scope.match(/^src:(\d+)$/);
  if (one) w.push(eq(items.sourceId, Number(one[1])));
  if (scope === "youtube" || scope === "ielts") w.push(sql`${items.sourceId} in (select id from listen_sources where kind = ${scope})`);
  if (scope === "fast") w.push(sql`${items.rate} >= 3`);
  if (scope === "numbers") w.push(sql`${items.text} regexp '[0-9]'`);
  return w;
}

/** Never two sentences of the same recording in a row when another one is left. */
export function interleave<T extends { sourceId: number }>(xs: T[]): T[] {
  const left = [...xs];
  const out: T[] = [];
  while (left.length) {
    const prev = out[out.length - 1]?.sourceId;
    const i = Math.max(0, left.findIndex((x) => x.sourceId !== prev));
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

/**
 * A practice session.
 * - review: sentences whose review is due, oldest first
 * - random: sentences of the current round not shown yet in it (round = times shown in random practice), shuffled;
 *   sentences in the review schedule are left to review
 * - mix: about 30 % review, the rest random
 * Random sentences come from IELTS recordings only, unless the scope is one source: a YouTube video has to load in the
 * player for every sentence of another video, so videos are practised one at a time ("src:<id>").
 */
export async function pickSession(mode: "review" | "random" | "mix", scope: string, n: number) {
  const db = getDb();
  const where = scopeWhere(scope);
  const mixed = mode !== "review" && !scope.startsWith("src:") ? [sql`${items.sourceId} in (select id from listen_sources where kind = 'ielts')`] : [];
  const dueRows = mode === "random" ? [] : await db.select().from(items).where(and(...where, ...mixed, isNotNull(items.due), lte(items.due, sql`now(3)`))).orderBy(asc(items.due)).limit(mode === "review" ? n : Math.ceil(n * 0.3));
  const fresh = and(...where, ...mixed, sql`(${items.due} is null or ${items.due} > now(3))`);
  let newRows: Item[] = [];
  if (mode !== "review") {
    const want = n - dueRows.length;
    // least-shown first, random inside a round; a few extra so interleaving has choice
    newRows = await db.select().from(items).where(fresh).orderBy(asc(items.round), sql`rand()`).limit(want * 2);
    newRows = interleave(newRows).slice(0, want);
  }
  const [{ total, minRound }] = await db.select({ total: sql<number>`count(*)`, minRound: sql<number>`coalesce(min(${items.round}), 0)` }).from(items).where(fresh);
  const [{ doneInRound }] = await db.select({ doneInRound: sql<number>`count(*)` }).from(items).where(and(fresh, sql`${items.round} > ${minRound}`));
  const all = mode === "mix" ? interleave([...dueRows, ...newRows].sort(() => Math.random() - 0.5)) : [...dueRows, ...newRows];
  const srcIds = [...new Set(all.map((r) => r.sourceId))];
  const sources = srcIds.length ? await db.select().from(src).where(inArray(src.id, srcIds)) : [];
  const saved = srcIds.length ? await db.select({ id: words.id, term: words.term, sourceId: words.listenSourceId }).from(words).where(inArray(words.listenSourceId, srcIds)) : [];
  return {
    items: play(all, await mediaOf(sources)),
    titles: Object.fromEntries(sources.map((s) => [s.id, s.title])),
    saved,
    round: { n: Number(minRound) + 1, done: Number(doneInRound), total: Number(total) },
  };
}

export async function dueCount() {
  const [{ n }] = await getDb().select({ n: sql<number>`count(*)` }).from(items).where(and(eq(items.hidden, false), isNotNull(items.due), lte(items.due, sql`now(3)`)));
  return Number(n);
}

/** Missed words by kind over the whole bank. */
export async function missTotals() {
  const rows = await getDb().select({ misses: items.misses }).from(items).where(isNotNull(items.misses));
  const out: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.misses ?? {})) out[k] = (out[k] ?? 0) + v;
  return out;
}

const DAY = 86_400_000;
export type Result = { first: boolean; hinted: boolean; misses: Record<string, number>; mode: "review" | "random" | "source"; minutes?: number };

/**
 * One sentence done. Scheduling uses the first check only:
 * right at once with no hint → known (out of review, or a longer gap while in it); right after corrections → back in
 * 3 days; a hint or the answer shown → back tomorrow.
 */
export async function recordResult(id: number, r: Result) {
  const db = getDb();
  const [it] = await db.select().from(items).where(eq(items.id, id));
  if (!it) return null;
  const now = Date.now();
  let { due, interval, lapses } = it;
  if (r.first && !r.hinted) {
    if (due) {
      interval = Math.round(Math.max(3, interval * 2.5));
      due = interval > 30 ? null : new Date(now + interval * DAY);
      if (!due) interval = 0;
    }
  } else if (!r.hinted) {
    interval = 3;
    due = new Date(now + 3 * DAY);
  } else {
    interval = 1;
    due = new Date(now + DAY);
    lapses++;
  }
  const misses = { ...(it.misses ?? {}) };
  for (const [k, v] of Object.entries(r.misses)) misses[k] = (misses[k] ?? 0) + v;
  await db
    .update(items)
    .set({
      tries: it.tries + 1,
      clean: it.clean + (r.first && !r.hinted ? 1 : 0),
      round: r.mode === "review" ? it.round : it.round + 1,
      seenAt: new Date(now),
      due,
      interval,
      lapses,
      misses: Object.keys(misses).length ? misses : null,
    })
    .where(eq(items.id, id));
  if (r.minutes) await bumpActivity({ minutes: Math.min(30, r.minutes) });
  await addXp("listen", r.first && !r.hinted ? XP.correctAnswer : 2, { type: "listen_item", id });
  return { due };
}

/** New source from cut sentences (replaces the sentences of an IELTS part cut again). */
export async function saveSource(s: Omit<typeof src.$inferInsert, "id">, clips: Clip[]) {
  const db = getDb();
  let id: number;
  const [old] = s.sectionId ? await db.select({ id: src.id }).from(src).where(eq(src.sectionId, s.sectionId)) : [];
  if (old) {
    id = old.id;
    await db.update(src).set({ ...s, reviewed: false, position: 0 }).where(eq(src.id, id));
    await db.delete(items).where(eq(items.sourceId, id));
  } else [{ id }] = await db.insert(src).values(s).$returningId();
  if (clips.length) await db.insert(items).values(clips.map((c, idx) => ({ sourceId: id, idx, start: c.start, end: c.end, text: c.text.slice(0, 5000), speaker: c.speaker?.slice(0, 64) ?? null, confidence: c.confidence, rate: rate(c) })));
  return id;
}

export type EditItem = { id?: number; start: number; end: number; text: string; speaker: string | null; hidden: boolean };
/** The review editor's list: kept sentences keep their id (and practice history), removed ones go, new ones are added. */
export async function saveItems(sourceId: number, list: EditItem[]) {
  const db = getDb();
  const have = await db.select({ id: items.id }).from(items).where(eq(items.sourceId, sourceId));
  const keep = new Set(list.filter((x) => x.id).map((x) => x.id!));
  const gone = have.filter((h) => !keep.has(h.id)).map((h) => h.id);
  if (gone.length) await db.delete(items).where(inArray(items.id, gone));
  for (const [idx, x] of list.entries()) {
    const v = { idx, start: x.start, end: Math.max(x.end, x.start + 0.3), text: x.text.slice(0, 5000), speaker: x.speaker?.slice(0, 64) || null, hidden: x.hidden, rate: rate({ ...x }) };
    if (x.id && keep.has(x.id)) await db.update(items).set(v).where(and(eq(items.id, x.id), eq(items.sourceId, sourceId)));
    else await db.insert(items).values({ ...v, sourceId });
  }
}

/** IELTS Listening parts that have audio, by book and test, with their place in the bank (if added). */
export async function ieltsParts() {
  const db = getDb();
  const rows = await db
    .select({ id: ieltsSections.id, part: ieltsSections.part, audio: ieltsSections.audio, script: sql<number>`length(trim(coalesce(${ieltsSections.transcript}, ''))) > 0`, test: ieltsTests.title, testNo: ieltsTests.number, book: ieltsBooks.title, bookId: ieltsBooks.id })
    .from(ieltsSections)
    .innerJoin(ieltsTests, eq(ieltsSections.testId, ieltsTests.id))
    .innerJoin(ieltsBooks, eq(ieltsTests.bookId, ieltsBooks.id))
    .where(and(eq(ieltsSections.skill, "listening"), isNotNull(ieltsSections.audio)))
    .orderBy(asc(ieltsBooks.id), asc(ieltsTests.number), asc(ieltsSections.part));
  const have = await db.select({ id: src.id, sectionId: src.sectionId }).from(src).where(isNotNull(src.sectionId));
  const bank = new Map(have.map((h) => [h.sectionId, h.id]));
  return rows.map((r) => ({ ...r, script: !!Number(r.script), sourceId: bank.get(r.id) ?? null }));
}

/** Whisper's words for an IELTS part (times in the file), for the review editor; null if it was never heard. */
export async function heardWords(sectionId: number | null) {
  if (!sectionId) return null;
  const [r] = await getDb().select({ heard: schema.listenSpeech.heard }).from(schema.listenSpeech).where(eq(schema.listenSpeech.sectionId, sectionId));
  return r?.heard ?? null;
}
