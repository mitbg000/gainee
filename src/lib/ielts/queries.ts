/** IELTS books, tests, sections and attempts (server only). */
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { addXp, bumpActivity, XP } from "@/lib/activity";
import { enqueue } from "@/lib/jobs";
import { myId } from "@/lib/owner";
import { saveWriting } from "@/lib/writing";
import { thinPassage } from "./coverage";
import { band, markSection, type Answers } from "./score";
import { fitAnswers, GROUP_TYPES, numbersOf, withoutPagePictures, type SectionContent, type Skill } from "./types";

const { ieltsBooks: books, ieltsPages: pages, ieltsTests: tests, ieltsSections: sections, ieltsAudio: audio, ieltsAttempts: attempts, jobs, writings } = schema;

export type SectionRow = Omit<typeof sections.$inferSelect, "content"> & { content: SectionContent };
// older imports: whole-page pictures dropped, answers in the form their question takes
const asSection = (s: typeof sections.$inferSelect): SectionRow => {
  const content = withoutPagePictures(s.content as unknown as SectionContent);
  return { ...s, content, answers: fitAnswers(content, s.answers) };
};

/* ---------- books ---------- */
export async function listBooks() {
  const db = getDb();
  const [bs, ts, ss, js] = await Promise.all([
    db.select().from(books).orderBy(desc(books.id)),
    db.select().from(tests).orderBy(asc(tests.number)),
    db.select({ id: sections.id, testId: sections.testId, skill: sections.skill, part: sections.part, title: sections.title, reviewed: sections.reviewed, content: sections.content, audio: sections.audio }).from(sections).orderBy(asc(sections.skill), asc(sections.part)),
    db.select({ id: jobs.id, payload: jobs.payload, status: jobs.status, progress: jobs.progress, error: jobs.error }).from(jobs).where(eq(jobs.type, "ielts_import")).orderBy(desc(jobs.id)).limit(50),
  ]);
  return bs.map((b) => ({
    ...b,
    job: js.find((j) => Number(j.payload.bookId) === b.id) ?? null,
    tests: ts
      .filter((t) => t.bookId === b.id)
      .map((t) => ({
        ...t,
        sections: ss
          .filter((s) => s.testId === t.id)
          .map(({ content, ...s }) => {
            const c = content as unknown as SectionContent;
            return { ...s, groups: c.groups.map((g) => ({ type: g.type, from: g.from, to: g.to })), warnings: c.warnings?.length ?? 0, thin: s.skill === "reading" && thinPassage(c.passage), hasAudio: !!s.audio, marked: s.audio?.start != null || s.audio?.end != null };
          }),
      })),
  }));
}
export type BookList = Awaited<ReturnType<typeof listBooks>>;

export async function createBook(title: string, pageCount: number) {
  const [{ id }] = await getDb().insert(books).values({ title, pageCount }).$returningId();
  return id;
}

export async function getBook(id: number) {
  const [b] = await getDb().select().from(books).where(eq(books.id, id));
  return b;
}

export async function savePage(bookId: number, page: number, text: string, imagePath: string | null, source: string | null = null) {
  await getDb()
    .insert(pages)
    .values({ bookId, page, text, imagePath, source })
    .onDuplicateKeyUpdate({ set: { text, imagePath, ocr: false, source } });
}

/** The PDF files a book was made of, in page order ("" = pages uploaded before file names were kept). */
export async function pdfFiles(bookId: number) {
  const rows = await getDb()
    .select({ source: pages.source, from: sql<number>`MIN(${pages.page})`, to: sql<number>`MAX(${pages.page})`, count: sql<number>`COUNT(*)` })
    .from(pages)
    .where(eq(pages.bookId, bookId))
    .groupBy(pages.source);
  return rows.map((r) => ({ name: r.source ?? "", from: Number(r.from), to: Number(r.to), count: Number(r.count) })).sort((a, b) => a.from - b.from);
}

/** Room for `count` more pages after the last one: the book's page count grows, the first new page number comes back. */
export async function addPageRoom(bookId: number, count: number) {
  return getDb().transaction(async (tx) => {
    await tx.update(books).set({ pageCount: sql`${books.pageCount} + ${count}` }).where(eq(books.id, bookId));
    const [b] = await tx.select({ n: books.pageCount }).from(books).where(eq(books.id, bookId));
    return b.n - count + 1;
  });
}

/** Take out the pages of one PDF file; returns their pictures to delete. */
export async function removePdfPages(bookId: number, source: string) {
  const db = getDb();
  const where = and(eq(pages.bookId, bookId), source ? eq(pages.source, source) : isNull(pages.source));
  const gone = await db.select({ p: pages.imagePath }).from(pages).where(where);
  await db.delete(pages).where(where);
  return gone.map((r) => r.p).filter((p): p is string => !!p);
}

export const renameTest = (id: number, title: string) => getDb().update(tests).set({ title }).where(eq(tests.id, id));
export const renameBook = (id: number, title: string) => getDb().update(books).set({ title }).where(eq(books.id, id));

/** resume: keep the tests and parts already made and do only the rest (after a stop or failure). */
export const BOOK_JOBS = ["ielts_import", "ielts_check", "ielts_fix_scripts", "ielts_resplit_scripts"] as const;

/** The book's jobs still waiting or running. */
export async function bookJobs(bookId: number) {
  const rows = await getDb().select({ id: jobs.id, type: jobs.type, status: jobs.status, progress: jobs.progress, payload: jobs.payload }).from(jobs).where(and(inArray(jobs.type, [...BOOK_JOBS]), inArray(jobs.status, ["queued", "running"]))).orderBy(asc(jobs.id));
  return rows.filter((j) => Number(j.payload.bookId) === bookId).map((j) => ({ id: j.id, type: j.type, status: j.status, progress: j.progress }));
}

/** Queue a book job once: pressing again (or after a reload) while it waits or runs gives the same job. */
export async function queueForBook(type: (typeof BOOK_JOBS)[number], bookId: number, payload: Record<string, unknown> = {}, maxAttempts = 2) {
  return (await bookJobs(bookId)).find((j) => j.type === type)?.id ?? enqueue(type, { bookId, ...payload }, { maxAttempts });
}

export async function startImport(bookId: number, resume = false) {
  if (!(await bookJobs(bookId)).some((j) => j.type === "ielts_import")) await getDb().update(books).set({ status: "parsing", error: null }).where(eq(books.id, bookId));
  return queueForBook("ielts_import", bookId, { resume }, 3);
}

export async function deleteBook(id: number) {
  const db = getDb();
  const files = [
    ...(await db.select({ p: pages.imagePath }).from(pages).where(and(eq(pages.bookId, id), isNotNull(pages.imagePath)))).map((r) => r.p!),
    ...(await db.select({ p: audio.path }).from(audio).where(eq(audio.bookId, id))).map((r) => r.p),
  ];
  await db.delete(books).where(eq(books.id, id));
  return files;
}

export const pageImages = async (bookId: number) =>
  (await getDb().select({ page: pages.page, path: pages.imagePath, ocr: pages.ocr }).from(pages).where(eq(pages.bookId, bookId)).orderBy(asc(pages.page))).map((p) => ({ page: p.page, url: p.path ? `/api/${p.path}` : null, ocr: p.ocr }));


/* ---------- audio (uploaded in chunks) ---------- */
export const audioFiles = (bookId: number) => getDb().select().from(audio).where(eq(audio.bookId, bookId)).orderBy(asc(audio.name));
export async function getAudio(id: number) {
  const [a] = await getDb().select().from(audio).where(eq(audio.id, id));
  return a;
}
export async function createAudio(bookId: number, name: string, size: number, path: string) {
  const [{ id }] = await getDb().insert(audio).values({ bookId, name, size, path }).$returningId();
  return id;
}
/** Store part marks of a recording and set start/end of every Listening part of the book that plays this file. */
export async function applyMarks(audioId: number, marks: Partial<Record<string, number>>) {
  const db = getDb();
  const a = await getAudio(audioId);
  if (!a) return 0;
  await db.update(audio).set({ marks: marks as Record<string, number> }).where(eq(audio.id, audioId));
  const ts = await db.select({ id: tests.id }).from(tests).where(eq(tests.bookId, a.bookId));
  if (!ts.length) return 0;
  const ss = await db.select({ id: sections.id, part: sections.part, audio: sections.audio }).from(sections).where(and(inArray(sections.testId, ts.map((t) => t.id)), eq(sections.skill, "listening")));
  let n = 0;
  for (const s of ss) {
    const start = marks[s.part];
    if (s.audio?.fileId !== audioId || start === undefined) continue;
    await db.update(sections).set({ audio: { fileId: audioId, start, end: marks[s.part + 1] ?? null } }).where(eq(sections.id, s.id));
    n++;
  }
  return n;
}
/**
 * Use a whole-test recording for one test of its book (or none): its Listening parts get the file with the part marks,
 * and parts of other tests that pointed at this file lose it.
 */
export async function assignAudio(audioId: number, testId: number | null) {
  const db = getDb();
  const a = await getAudio(audioId);
  if (!a) return 0;
  const ts = await db.select({ id: tests.id }).from(tests).where(eq(tests.bookId, a.bookId));
  if (testId && !ts.some((t) => t.id === testId)) return 0;
  if (!ts.length) return 0;
  const ss = await db.select({ id: sections.id, testId: sections.testId, part: sections.part, audio: sections.audio }).from(sections).where(and(inArray(sections.testId, ts.map((t) => t.id)), eq(sections.skill, "listening")));
  const marks = a.marks ?? {};
  let n = 0;
  for (const s of ss) {
    if (s.testId === testId) {
      await db.update(sections).set({ audio: { fileId: audioId, start: marks[s.part] ?? null, end: marks[s.part + 1] ?? null } }).where(eq(sections.id, s.id));
      n++;
    } else if (s.audio?.fileId === audioId) await db.update(sections).set({ audio: null }).where(eq(sections.id, s.id));
  }
  return n;
}

/** Delete a recording: Listening parts that played it are left without audio. Returns the stored file to remove. */
export async function deleteAudio(id: number) {
  const db = getDb();
  const a = await getAudio(id);
  if (!a) return null;
  await assignAudio(id, null);
  await db.delete(audio).where(eq(audio.id, id));
  return a.path;
}

/** Test number → its id in a book. */
export const testOfBook = async (bookId: number, number: number) => (await getDb().select({ id: tests.id }).from(tests).where(and(eq(tests.bookId, bookId), eq(tests.number, number))))[0]?.id ?? null;

/** audio id → id of the test whose Listening parts use it (book page select). */
export async function audioTests(bookId: number) {
  const db = getDb();
  const ts = await db.select({ id: tests.id }).from(tests).where(eq(tests.bookId, bookId));
  const out: Record<number, number> = {};
  if (!ts.length) return out;
  for (const s of await db.select({ testId: sections.testId, audio: sections.audio }).from(sections).where(and(inArray(sections.testId, ts.map((t) => t.id)), eq(sections.skill, "listening")))) if (s.audio?.fileId) out[s.audio.fileId] = s.testId;
  return out;
}
export const setReceived = (id: number, received: number) => getDb().update(audio).set({ received }).where(eq(audio.id, id));

/* ---------- tests & sections ---------- */
export async function getTest(id: number) {
  const db = getDb();
  const [t] = await db.select().from(tests).where(eq(tests.id, id));
  if (!t) return null;
  const [book, ss] = await Promise.all([getBook(t.bookId), db.select().from(sections).where(eq(sections.testId, id)).orderBy(asc(sections.part))]);
  return { ...t, book, sections: ss.map(asSection) };
}

export async function getSection(id: number) {
  const [s] = await getDb().select().from(sections).where(eq(sections.id, id));
  if (!s) return null;
  const test = await getTest(s.testId);
  return { section: asSection(s), test: test! };
}

const Opt = z.object({ key: z.string().max(10), text: z.string().max(2000) });
const GroupInput = z.object({
  type: z.enum(GROUP_TYPES),
  from: z.number().int().min(1).max(60),
  to: z.number().int().min(1).max(60),
  instructions: z.string().max(4000),
  text: z.string().max(20000).optional(),
  options: z.array(Opt).max(40).optional(),
  optionsTitle: z.string().max(300).optional(),
  items: z.array(z.object({ n: z.array(z.number().int().min(1).max(60)).min(1).max(5), q: z.string().max(4000), options: z.array(Opt).max(12).optional(), image: z.string().max(500).optional() })).max(60).optional(),
  image: z.string().max(500).optional(),
});
export const SectionPatch = z.object({
  title: z.string().max(255).nullable().optional(),
  content: z
    .object({
      passage: z.string().max(60000).optional(),
      intro: z.string().max(2000).optional(),
      groups: z.array(GroupInput).max(20),
      prompt: z.string().max(8000).optional(),
      image: z.string().max(500).optional(),
      warnings: z.array(z.string().max(500)).max(50).optional(),
    })
    .optional(),
  answers: z.record(z.string(), z.string().max(300)).optional(),
  transcript: z.string().max(100000).nullable().optional(),
  audio: z.object({ fileId: z.number().int().positive(), start: z.number().min(0).nullable().optional(), end: z.number().min(0).nullable().optional() }).nullable().optional(),
  pages: z.tuple([z.number().int().min(1), z.number().int().min(1)]).optional(),
  reviewed: z.boolean().optional(),
});
export async function updateSection(id: number, patch: z.infer<typeof SectionPatch>) {
  const { content, ...rest } = patch;
  await getDb()
    .update(sections)
    .set({ ...rest, ...(content ? { content: content as Record<string, unknown> } : {}) })
    .where(eq(sections.id, id));
}

/* ---------- attempts ---------- */
export const AttemptInput = z.object({
  testId: z.number().int().positive(),
  sectionId: z.number().int().positive().optional(),
  group: z.number().int().min(0).optional(),
  mode: z.enum(["mock", "practice"]),
  skill: z.enum(["listening", "reading", "writing", "full"]),
  answers: z.record(z.string(), z.string().max(20000)),
  seconds: z.number().int().min(0).max(24 * 3600),
  /** mock: questions ticked "Review" */
  flags: z.array(z.string().max(40)).max(200).optional(),
});

/** Mark and store a try. Listening/Reading: per-question marks + band. Writing: stored as writings (graded on the result page). */
export async function saveAttempt(input: z.infer<typeof AttemptInput>) {
  const t = await getTest(input.testId);
  if (!t) return null;
  const skills: Skill[] = input.skill === "full" ? ["listening", "reading", "writing"] : [input.skill];
  const marks: Record<string, Record<number, boolean>> = {};
  const scores: Record<string, { score: number; total: number; band: number }> = {};
  const wrote: { sectionId: number; part: number; writingId: number }[] = [];

  for (const skill of skills) {
    const ss = t.sections.filter((s) => s.skill === skill && (!input.sectionId || s.id === input.sectionId));
    if (skill === "writing") {
      for (const s of ss) {
        const body = input.answers[`w${s.part}`] ?? "";
        if (!body.trim()) continue;
        const prompt = [s.content.prompt ?? "", s.content.image ? `\n\n![](${s.content.image})` : ""].join("");
        wrote.push({ sectionId: s.id, part: s.part, writingId: await saveWriting(null, { kind: s.part === 1 ? "task1" : "task2", prompt: prompt.slice(0, 4000), body }) });
      }
      continue;
    }
    let score = 0;
    let total = 0;
    for (const s of ss) {
      const given: Answers = {};
      for (const n of numbersOf(s.content)) if (input.answers[`${s.id}:${n}`]) given[n] = input.answers[`${s.id}:${n}`];
      const m = markSection(s.content, given, s.answers, input.sectionId ? input.group : undefined);
      marks[s.id] = m;
      score += Object.values(m).filter(Boolean).length;
      total += Object.keys(m).length;
    }
    scores[skill] = { score, total, band: band(skill, score, total) };
  }

  const one = input.skill !== "full" && input.skill !== "writing" ? scores[input.skill] : undefined;
  const [{ id }] = await getDb()
    .insert(attempts)
    .values({
      userId: await myId(),
      testId: input.testId,
      sectionId: input.sectionId ?? null,
      mode: input.mode,
      skill: input.skill,
      answers: input.answers,
      detail: { marks, scores, writing: wrote, group: input.group ?? null, flags: input.flags ?? [], ai: [] },
      score: one?.score ?? null,
      total: one?.total ?? null,
      band: one?.band ?? null,
      seconds: input.seconds,
    })
    .$returningId();
  // IELTS time counts like reading time: daily minutes (goal, streak, heat map) and XP for the time and right answers
  const minutes = Math.min(180, Math.round(input.seconds / 60));
  if (minutes) await bumpActivity({ minutes });
  const right = Object.values(scores).reduce((a, s) => a + s.score, 0);
  await addXp("ielts", Math.min(30, minutes * XP.readingMinute) + right * XP.correctAnswer, { type: "ielts_attempt", id });
  return id;
}

export type AttemptDetail = {
  marks: Record<string, Record<number, boolean>>;
  scores: Record<string, { score: number; total: number; band: number }>;
  writing: { sectionId: number; part: number; writingId: number }[];
  group: number | null;
  flags?: string[];
  /** AI explanations and questions asked while reviewing this try */
  ai?: { n: number | null; question: string; answer: string; at: string }[];
};

export const AiNote = z.object({ n: z.number().int().min(1).max(60).nullable(), question: z.string().max(2000), answer: z.string().min(1).max(20000) });
/** Keep an AI explanation with the try it belongs to (history). */
export async function addAiNote(id: number, note: z.infer<typeof AiNote>) {
  const [a] = await getDb().select({ detail: attempts.detail }).from(attempts).where(and(eq(attempts.id, id), eq(attempts.userId, await myId())));
  if (!a) return false;
  const d = a.detail as unknown as AttemptDetail;
  d.ai = [...(d.ai ?? []), { ...note, at: new Date().toISOString() }].slice(-50);
  await getDb().update(attempts).set({ detail: d as unknown as Record<string, unknown> }).where(eq(attempts.id, id));
  return true;
}
/** Store the Writing / overall band once the AI grades are in, so the history list shows it. */
export const setAttemptBand = async (id: number, band: number) => getDb().update(attempts).set({ band }).where(and(eq(attempts.id, id), eq(attempts.userId, await myId())));

export async function getAttempt(id: number) {
  const uid = await myId();
  const [a] = await getDb().select().from(attempts).where(and(eq(attempts.id, id), eq(attempts.userId, uid)));
  if (!a) return null;
  const detail = a.detail as unknown as AttemptDetail;
  const ws = detail.writing?.length ? await getDb().select().from(writings).where(and(eq(writings.userId, uid), inArray(writings.id, detail.writing.map((w) => w.writingId)))) : [];
  return { ...a, detail, writings: ws, test: (await getTest(a.testId))! };
}

export async function recentAttempts(limit = 30) {
  const db = getDb();
  const rows = await db.select({ id: attempts.id, testId: attempts.testId, sectionId: attempts.sectionId, mode: attempts.mode, skill: attempts.skill, score: attempts.score, total: attempts.total, band: attempts.band, seconds: attempts.seconds, createdAt: attempts.createdAt, detail: attempts.detail }).from(attempts).where(eq(attempts.userId, await myId())).orderBy(desc(attempts.id)).limit(limit);
  return rows.map(({ detail, ...r }) => {
    const d = detail as unknown as AttemptDetail;
    return { ...r, scores: d.scores ?? {}, group: d.group, aiNotes: d.ai?.length ?? 0, writing: d.writing?.length ?? 0 };
  });
}

/**
 * Questions still wrong: for every (section, question) the LAST try counts, so a question answered right later
 * leaves the list. Grouped by question type for the "weak types" chart.
 */
export async function mistakes() {
  const db = getDb();
  const rows = await db.select({ id: attempts.id, detail: attempts.detail, answers: attempts.answers, createdAt: attempts.createdAt }).from(attempts).where(eq(attempts.userId, await myId())).orderBy(asc(attempts.id));
  const last = new Map<string, { right: boolean; given: string; at: Date }>();
  const tries = new Map<string, number>();
  for (const r of rows) {
    const d = r.detail as unknown as AttemptDetail;
    for (const [sid, m] of Object.entries(d.marks ?? {}))
      for (const [n, right] of Object.entries(m)) {
        const k = `${sid}:${n}`;
        last.set(k, { right, given: String((r.answers as Record<string, unknown>)[k] ?? ""), at: r.createdAt });
        tries.set(k, (tries.get(k) ?? 0) + 1);
      }
  }
  const ids = [...new Set([...last.keys()].map((k) => Number(k.split(":")[0])))];
  const ss = ids.length ? (await db.select().from(sections).where(inArray(sections.id, ids))).map(asSection) : [];
  const ts = ss.length ? await db.select().from(tests).where(inArray(tests.id, [...new Set(ss.map((s) => s.testId))])) : [];
  const bs = ts.length ? await db.select({ id: books.id, title: books.title }).from(books).where(inArray(books.id, [...new Set(ts.map((t) => t.bookId))])) : [];

  const byType: Record<string, { right: number; total: number }> = {};
  const wrong: { sectionId: number; group: number; n: number; type: string; given: string; key: string; label: string; at: Date }[] = [];
  for (const s of ss) {
    const t = ts.find((x) => x.id === s.testId);
    const label = `${bs.find((b) => b.id === t?.bookId)?.title ?? ""} · ${t?.title ?? ""} · ${s.skill === "listening" ? "Listening" : "Reading"} ${s.part}`;
    s.content.groups.forEach((g, gi) => {
      for (let n = g.from; n <= g.to; n++) {
        const v = last.get(`${s.id}:${n}`);
        if (!v) continue;
        const type = g.type === "gap" ? (s.skill === "listening" ? "gap_l" : "gap_r") : g.type;
        byType[type] ??= { right: 0, total: 0 };
        byType[type].total++;
        if (v.right) byType[type].right++;
        else wrong.push({ sectionId: s.id, group: gi, n, type, given: v.given, key: s.answers[n] ?? "", label, at: v.at });
      }
    });
  }
  return { byType, wrong: wrong.sort((a, b) => +b.at - +a.at) };
}
