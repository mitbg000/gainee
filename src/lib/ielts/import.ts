/**
 * Worker side of an IELTS book upload:
 *  1. OCR pages that have no text layer (scanned books) with a vision model, one page per call
 *  2. outline: which pages hold each test's Listening parts, Reading passages, Writing tasks, answer keys and audioscripts
 *  3. one AI call per section → questions in the app's format (see types.ts)
 *  4. one AI call per test → answer key; audioscripts are split by "PART n" without AI
 *  5. audio files are matched to tests/parts by file name ("Test 2", "Test 6 Section 4")
 * The result is a draft: the review screen is where the user fixes tables, crops maps/charts and checks answers.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { chat, parseJsonReply } from "@/lib/ai/client";
import { setProgress, type Job } from "@/lib/jobs";
import { getSetting, setSetting } from "@/lib/settings";
import { UPLOAD_DIR } from "@/lib/storage";
import { GROUP_TYPES, type Group, type SectionContent, type Skill } from "./types";

const { ieltsBooks, ieltsPages, ieltsTests, ieltsSections, ieltsAudio } = schema;
type Page = typeof ieltsPages.$inferSelect;

const EMPTY = (t: string | null) => (t ?? "").replace(/\s+/g, "").length < 40;

async function ocrPage(p: Page): Promise<string> {
  const bytes = await fs.readFile(path.join(UPLOAD_DIR, p.imagePath!));
  const { text } = await chat({
    task: "ielts_import",
    temperature: 0,
    maxTokens: 4000,
    messages: [
      { role: "system", content: "You transcribe scanned pages of an IELTS practice book exactly. Output plain text only." },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Transcribe every word on this page in reading order, keeping line breaks and question numbers.
- Tables: Markdown rows like "| Name | Cost |".
- Answer blanks: keep the number and dots, e.g. "7 ..........".
- Charts, maps, plans, diagrams: one line "[FIGURE: what it shows]" (also copy any labels or numbers printed on it).
- Two-column pages: left column first.`,
          },
          { type: "image_url", image_url: { url: `data:image/webp;base64,${bytes.toString("base64")}` } },
        ],
      },
    ],
  });
  return text.trim();
}

type Range = { part: number; pages: [number, number] };
type Outline = {
  tests: { number: number; listening?: Range[]; reading?: Range[]; writing?: Range[]; answerPages?: number[]; scriptPages?: number[] }[];
};

async function outline(pages: Page[]): Promise<Outline> {
  const heads = pages.map((p) => `[${p.page}] ${(p.text ?? "").replace(/\s+/g, " ").slice(0, 220)}`).join("\n");
  const { text } = await chat({
    task: "ielts_import",
    json: true,
    temperature: 0,
    maxTokens: 4000,
    messages: [
      { role: "system", content: "You map the pages of a Cambridge IELTS practice book. Reply with one JSON object only." },
      {
        role: "user",
        content: `Below is the start of every page as "[page number] text". Find each practice test and the page ranges (inclusive, using the numbers in brackets) of:
- listening: each Part/Section 1-4 (questions pages only, not audioscripts)
- reading: each Reading Passage 1-3 together with its questions
- writing: Task 1 and Task 2
- answerPages: pages of the Listening and Reading answer key for this test
- scriptPages: pages of this test's listening audioscript (transcript)
Only Academic tests (skip General Training). Skip Speaking.
JSON: {"tests":[{"number":1,"listening":[{"part":1,"pages":[11,11]}],"reading":[{"part":1,"pages":[17,20]}],"writing":[{"part":1,"pages":[30,30]},{"part":2,"pages":[31,31]}],"answerPages":[118,119],"scriptPages":[97,101]}]}

${heads}`,
      },
    ],
  });
  return parseJsonReply<Outline>(text);
}

const FORMAT = `Question format (JSON):
{"passage":"…","intro":"…","groups":[GROUP…],"prompt":"…","warnings":["…"]}
GROUP = {"type":"gap|mcq|multi|tfng|ynng|match","from":1,"to":6,"instructions":"Complete the table below. Write ONE WORD AND/OR A NUMBER for each answer.", …}
- gap (notes, form, table, summary, sentence/flow-chart completion, short answers, diagram labels): "text" with each blank written [[n]].
  Lines: "# heading", "- bullet", table rows "| Name | Cost |" (first row = header). Keep the words around blanks exactly.
  If the blanks are on a picture (diagram/map labels) also set "figure":true and list the labels in "text".
- mcq (choose ONE letter): "items":[{"n":[11],"q":"question","options":[{"key":"A","text":"…"}]}]
- multi (choose TWO/THREE letters): "items":[{"n":[21,22],"q":"Which TWO …?","options":[…]}]
- tfng (TRUE/FALSE/NOT GIVEN) and ynng (YES/NO/NOT GIVEN): "items":[{"n":[8],"q":"statement"}]
- match (matching features/information/headings/sentence endings, map or plan letters): "optionsTitle":"List of Headings", "options":[{"key":"i","text":"…"}], "items":[{"n":[14],"q":"Paragraph A"}]. For a map/plan set "figure":true.
Rules: copy the book's wording exactly; every question number from..to appears once; never invent answers.
"passage": Reading only – the full passage text, paragraphs separated by a blank line, paragraph letters as "**A** " at the start, title as the first line "# Title". Listening: omit.
"intro": the line "You should spend about 20 minutes on Questions …" (Reading) or "" otherwise.
"prompt" (Writing only): the full task text. Set "figure":true at top level when it has a chart/diagram/map.
"warnings": short notes for a human checker about anything unclear or lost (e.g. "table layout unclear for 1-6").`;

type RawSection = SectionContent & { figure?: boolean; groups: (Group & { figure?: boolean })[] };

async function parseSection(skill: Skill, part: number, text: string): Promise<RawSection> {
  const what = skill === "listening" ? `Listening Part ${part}` : skill === "reading" ? `Reading Passage ${part}` : `Writing Task ${part}`;
  const { text: reply } = await chat({
    task: "ielts_import",
    json: true,
    temperature: 0,
    maxTokens: 12000,
    timeoutMs: 300_000,
    messages: [
      { role: "system", content: "You convert IELTS practice book pages into structured JSON for a computer-based test. Reply with one JSON object only." },
      { role: "user", content: `Extract ONLY ${what} from these pages (ignore other parts that share the pages).\n\n${FORMAT}\n\nPAGES:\n"""\n${text}\n"""` },
    ],
  });
  const raw = parseJsonReply<RawSection>(reply);
  raw.groups = (Array.isArray(raw.groups) ? raw.groups : []).filter((g) => GROUP_TYPES.includes(g.type) && Number(g.from) > 0);
  for (const g of raw.groups) {
    g.from = Number(g.from);
    g.to = Number(g.to) || g.from;
  }
  return raw;
}

async function answerKey(testNo: number, text: string): Promise<{ listening: Record<string, string>; reading: Record<string, string> }> {
  const { text: reply } = await chat({
    task: "ielts_import",
    json: true,
    temperature: 0,
    maxTokens: 3000,
    messages: [
      { role: "system", content: "You read IELTS answer keys. Reply with one JSON object only." },
      {
        role: "user",
        content: `From the answer key pages below take Test ${testNo} only (Listening and Reading, questions 1-40 each).
Keep alternatives as written with "/" (e.g. "10/ten", "café/cafe", "metal(s)"). TRUE/FALSE/NOT GIVEN and YES/NO/NOT GIVEN in capitals.
"21&22 IN EITHER ORDER B D" → "21":"B","22":"D".
JSON: {"listening":{"1":"…",…,"40":"…"},"reading":{"1":"…",…,"40":"…"}}

"""
${text}
"""`,
      },
    ],
  });
  const r = parseJsonReply<{ listening?: Record<string, string>; reading?: Record<string, string> }>(reply);
  return { listening: r.listening ?? {}, reading: r.reading ?? {} };
}

/** Audioscript of one test → text per part, split on "PART 2" / "SECTION 2" lines. */
export function splitScript(text: string): Record<number, string> {
  const out: Record<number, string> = {};
  const marks = [...text.matchAll(/^\s*(?:PART|SECTION)\s+([1-4])\b.*$/gim)];
  marks.forEach((m, i) => {
    const part = Number(m[1]);
    const body = text.slice(m.index! + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined).trim();
    if (!out[part] && body.length > 200) out[part] = body;
  });
  return out;
}

/** Speaker names printed as a block apart from their lines ("WOMAN:\nMAN:\nWOMAN:…"): text taken from a two-column page. */
export const scriptLooksBroken = (t: string | null) => !!t && /(^[A-Z][A-Z .'’-]{0,24}:\s*\n){3,}/m.test(t);

/** Rebuild a transcript whose speaker names were separated from their lines, and fix encoding slips (Â£ → £). */
export async function fixTranscript(text: string): Promise<string> {
  const { text: out } = await chat({
    task: "ielts_import",
    temperature: 0,
    maxTokens: 8000,
    timeoutMs: 240_000,
    messages: [
      { role: "system", content: "You repair IELTS listening transcripts copied from PDFs. Reply with the repaired transcript only, no comments." },
      {
        role: "user",
        content: `In this transcript the speaker names were printed in a column apart from their lines, so they appear as a block. Rebuild the dialogue:
- every turn on its own line starting with its speaker name, e.g. "WOMAN: Hello, Oyster Bay Sailing Club."; use the names in the order given and the conversation to decide who says what
- keep every spoken word exactly; join lines broken in the middle of a sentence
- remove page numbers, running heads ("Test 1", "Audioscripts") and answer markers ("Q11", "08" in the margin)
- fix broken characters such as "Â£" → "£", "â€™" → "’"
- a monologue (one speaker) stays as paragraphs

"""
${text}
"""`,
      },
    ],
  });
  return out.replace(/^```\w*\n?|```$/g, "").trim();
}

/** Worker job: repair every broken-looking Listening transcript of a book (payload: { bookId }). */
export async function fixBookScripts(job: Job) {
  const db = getDb();
  const ts = await db.select({ id: ieltsTests.id }).from(ieltsTests).where(eq(ieltsTests.bookId, Number(job.payload.bookId)));
  if (!ts.length) return { fixed: 0 };
  const ss = (await db.select({ id: ieltsSections.id, transcript: ieltsSections.transcript }).from(ieltsSections).where(and(inArray(ieltsSections.testId, ts.map((t) => t.id)), eq(ieltsSections.skill, "listening")))).filter((s) => scriptLooksBroken(s.transcript) || s.transcript?.includes("Â"));
  for (const [i, s] of ss.entries()) {
    await setProgress(job.id, `transcript ${i + 1}/${ss.length}`);
    await db.update(ieltsSections).set({ transcript: await fixTranscript(s.transcript!) }).where(eq(ieltsSections.id, s.id));
  }
  return { fixed: ss.length };
}

/** "Cambridge 21 - Test 1.mp3" → {test:1}; "Test 6 Section 4.mp3" / "IELTS11_Test1_Section1" → {test, part}. */
export function audioTarget(name: string): { test: number; part?: number } | null {
  const t = name.match(/test[\s_-]*(\d{1,2})/i);
  if (!t) return null;
  const p = name.match(/(?:section|part)[\s_-]*([1-4])/i);
  return { test: Number(t[1]), part: p ? Number(p[1]) : undefined };
}

/** Transcript as stored: repaired by AI when the names came apart from the lines (kept as is if AI fails). */
const repaired = async (t: string | undefined) => (!t ? null : scriptLooksBroken(t) ? await fixTranscript(t).catch(() => t) : t);

const textOf = (pages: Page[], [a, b]: [number, number]) =>
  pages
    .filter((p) => p.page >= a && p.page <= b)
    .map((p) => `===== page ${p.page} =====\n${p.text ?? ""}`)
    .join("\n");

/** Pages listed or ranged → the same "===== page n =====" text. */
const textOfList = (pages: Page[], list: number[] = []) => (list.length ? textOf(pages, [Math.min(...list), Math.max(...list)]) : "");

export async function importBook(job: Job) {
  const bookId = Number(job.payload.bookId);
  const db = getDb();
  const [book] = await db.select().from(ieltsBooks).where(eq(ieltsBooks.id, bookId));
  if (!book) return { skipped: "book deleted" };
  await db.update(ieltsBooks).set({ status: "parsing", error: null }).where(eq(ieltsBooks.id, bookId));
  try {
    let pages = await db.select().from(ieltsPages).where(eq(ieltsPages.bookId, bookId)).orderBy(asc(ieltsPages.page));

    // 1) OCR scanned pages (kept on retry: pages already read are skipped)
    const scans = pages.filter((p) => EMPTY(p.text) && p.imagePath);
    for (const [i, p] of scans.entries()) {
      await setProgress(job.id, `ocr ${i + 1}/${scans.length}`);
      const text = await ocrPage(p);
      await db.update(ieltsPages).set({ text, ocr: true }).where(eq(ieltsPages.id, p.id));
      p.text = text;
    }
    pages = pages.filter((p) => !EMPTY(p.text));

    // A retry after a restart, or "Continue", keeps the tests and parts already made and does only the rest,
    // with the same outline as before. "Read again" (a fresh job) replaces the draft.
    const resume = job.payload.resume === true || job.attempts > 1;
    const planKey = `ielts.plan.${bookId}`;

    // 2) outline
    let plan = resume ? await getSetting<Outline>(planKey) : undefined;
    if (!plan?.tests?.length) {
      await setProgress(job.id, "outline");
      plan = await outline(pages);
      if (!plan.tests?.length) throw new Error("No tests found in the book");
      await setSetting(planKey, plan);
    }
    if (!resume) await db.delete(ieltsTests).where(eq(ieltsTests.bookId, bookId));
    const oldTests = await db.select({ id: ieltsTests.id, number: ieltsTests.number }).from(ieltsTests).where(eq(ieltsTests.bookId, bookId));
    const oldSections = oldTests.length ? await db.select({ testId: ieltsSections.testId, skill: ieltsSections.skill, part: ieltsSections.part }).from(ieltsSections).where(inArray(ieltsSections.testId, oldTests.map((x) => x.id))) : [];
    const pageImg = new Map(pages.map((p) => [p.page, p.imagePath ? `/api/${p.imagePath}` : undefined]));
    const audio = await db.select().from(ieltsAudio).where(eq(ieltsAudio.bookId, bookId));

    // names without a test number ("ielts11.mp3", "ielts12.mp3"…): one file per test, in name order, when the counts match
    const unnamed = audio.filter((a) => !audioTarget(a.name)).sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
    const order = [...plan.tests].sort((x, y) => x.number - y.number);
    const byOrder = new Map<number, { test: number; part?: number }>(unnamed.length === order.length ? unnamed.map((a, i) => [a.id, { test: order[i].number }]) : []);

    const total = plan.tests.reduce((a, t) => a + (t.listening?.length ?? 0) + (t.reading?.length ?? 0) + (t.writing?.length ?? 0) + 1, 0);
    let done = 0;
    for (const t of plan.tests) {
      const testId = oldTests.find((x) => x.number === t.number)?.id ?? (await db.insert(ieltsTests).values({ bookId, number: t.number, title: `Test ${t.number}` }).$returningId())[0].id;
      const made = (skill: string, part: number) => oldSections.some((s) => s.testId === testId && s.skill === skill && s.part === part);
      const left = (["listening", "reading", "writing"] as const).some((sk) => (t[sk] ?? []).some((r) => !made(sk, r.part)));

      await setProgress(job.id, `answers ${t.number} (${++done}/${total})`);
      const key = left && t.answerPages?.length ? await answerKey(t.number, textOfList(pages, t.answerPages)).catch(() => ({ listening: {}, reading: {} })) : { listening: {}, reading: {} };
      const scripts = splitScript(textOfList(pages, t.scriptPages));
      const files = audio.map((a) => ({ a, to: audioTarget(a.name) ?? byOrder.get(a.id) ?? null })).filter((x) => x.to?.test === t.number);

      for (const skill of ["listening", "reading", "writing"] as const) {
        for (const r of t[skill] ?? []) {
          ++done;
          if (made(skill, r.part)) continue; // done before the restart
          await setProgress(job.id, `test ${t.number} ${skill} ${r.part} (${done}/${total})`);
          const range: [number, number] = [Number(r.pages[0]), Number(r.pages[1] ?? r.pages[0])];
          let c: RawSection;
          try {
            c = await parseSection(skill, r.part, textOf(pages, range));
          } catch (e) {
            c = { groups: [], warnings: [`AI could not read this part: ${e instanceof Error ? e.message : e}`] };
          }
          const warnings = [...(c.warnings ?? [])];
          // pictures: the whole page for now; the reviewer crops it
          for (const g of c.groups) {
            if (g.figure) {
              g.image = pageImg.get(range[0]);
              warnings.push(`Questions ${g.from}-${g.to}: crop the picture`);
            }
            delete g.figure;
          }
          if (skill === "writing" && (c.figure || r.part === 1)) {
            c.image = pageImg.get(range[0]);
            warnings.push("Crop the chart/diagram");
          }
          delete c.figure;
          const nums = c.groups.flatMap((g) => Array.from({ length: g.to - g.from + 1 }, (_, k) => g.from + k));
          const all: Record<string, string> = skill === "listening" ? key.listening : skill === "reading" ? key.reading : {};
          const answers = Object.fromEntries(nums.filter((n) => all[n]).map((n) => [String(n), String(all[n])]));
          if (skill !== "writing" && nums.length && Object.keys(answers).length < nums.length) warnings.push("Some answers are missing");
          const file = skill === "listening" ? (files.find((f) => f.to?.part === r.part) ?? files.find((f) => !f.to?.part)) : undefined;
          await db.insert(ieltsSections).values({
            testId,
            skill,
            part: r.part,
            title: skill === "reading" ? (c.passage?.match(/^#\s*(.+)$/m)?.[1]?.slice(0, 250) ?? null) : null,
            content: { ...c, warnings } as unknown as Record<string, unknown>,
            answers,
            transcript: skill === "listening" ? await repaired(scripts[r.part]) : null,
            // a whole-test file with part marks (found in the browser) gets this part's stretch
            audio: file ? (!file.to?.part && file.a.marks?.[r.part] !== undefined ? { fileId: file.a.id, start: file.a.marks[r.part], end: file.a.marks[r.part + 1] ?? null } : { fileId: file.a.id }) : null,
            pages: [range[0], range[1]],
          });
        }
      }
    }
    await db.update(ieltsBooks).set({ status: "review" }).where(eq(ieltsBooks.id, bookId));
    return { tests: plan.tests.length };
  } catch (e) {
    // the worker retries; the last failure is shown on the book
    await db.update(ieltsBooks).set({ status: job.attempts >= job.maxAttempts ? "failed" : "parsing", error: e instanceof Error ? e.message.slice(0, 1000) : String(e) }).where(eq(ieltsBooks.id, bookId));
    throw e;
  }
}

/** Re-read one section with AI (review screen button), keeping its answers when the new reply has none. */
export async function reparseSection(sectionId: number) {
  const db = getDb();
  const [s] = await db.select().from(ieltsSections).where(eq(ieltsSections.id, sectionId));
  if (!s) return null;
  const [t] = await db.select().from(ieltsTests).where(eq(ieltsTests.id, s.testId));
  const [a, b] = s.pages;
  const pages = await db
    .select()
    .from(ieltsPages)
    .where(and(eq(ieltsPages.bookId, t.bookId), inArray(ieltsPages.page, Array.from({ length: Math.max(0, b - a) + 1 }, (_, k) => a + k))))
    .orderBy(asc(ieltsPages.page));
  const c = await parseSection(s.skill, s.part, textOf(pages, [a, b]));
  const old = s.content as unknown as SectionContent;
  for (const g of c.groups) {
    g.image = old.groups.find((o) => o.from === g.from && o.to === g.to)?.image;
    delete g.figure;
  }
  delete c.figure;
  if (s.skill === "writing") c.image = old.image;
  await db.update(ieltsSections).set({ content: c as unknown as Record<string, unknown>, reviewed: false }).where(eq(ieltsSections.id, sectionId));
  return c;
}
