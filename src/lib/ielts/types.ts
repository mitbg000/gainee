/**
 * IELTS question content, shared by the importer, the review editor, practice and the mock test.
 * Kept as JSON on ielts_sections.content; answers live apart in ielts_sections.answers ({"1":"10/ten", "8":"TRUE"}).
 */
export const GROUP_TYPES = ["gap", "mcq", "multi", "tfng", "ynng", "match"] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

export type Option = { key: string; text: string };
/** One question; `n` has two or more numbers only for "choose TWO/THREE letters" (multi). */
export type Item = { n: number[]; q: string; options?: Option[]; /** the question is a picture, or its options are (bar chart columns, drawings A–C) */ image?: string };

export type Group = {
  type: GroupType;
  from: number;
  to: number;
  /** "Complete the notes below. Write ONE WORD ONLY for each answer." */
  instructions: string;
  /** gap: notes / table / summary / form with blanks written [[7]]. Lines: "# heading", "- bullet", "| a | b |" table rows (one per row, "<br>" between the lines inside a cell). */
  text?: string;
  /** match: the shared list (features, headings, sentence endings, letters on a map). */
  options?: Option[];
  optionsTitle?: string;
  items?: Item[];
  /** map / diagram / plan / flow chart picture (cropped from the book page on the review screen). */
  image?: string;
};

export type SectionContent = {
  /** Reading passage or notes heading, as Markdown-ish text: paragraphs split by blank lines, "**A**" paragraph letters. */
  passage?: string;
  /** "You should spend about 20 minutes on Questions 1–13…" */
  intro?: string;
  groups: Group[];
  /** Writing: the task text and the chart/diagram picture. */
  prompt?: string;
  image?: string;
  /** AI importer notes for the reviewer: "table layout lost", "map needed for 11-15"… */
  warnings?: string[];
};

export type Skill = "listening" | "reading" | "writing";
export const SKILL_TIME: Record<Skill, number> = { listening: 30 * 60, reading: 60 * 60, writing: 60 * 60 };

/** Whole book pages ("/api/images/ielts/…") that older imports attached as pictures: dropped, the reviewer crops instead. */
const isBookPage = (url?: string) => !!url?.startsWith("/api/images/ielts/");
export function withoutPagePictures(c: SectionContent): SectionContent {
  const drop = <T extends { image?: string }>(x: T): T => (isBookPage(x.image) ? { ...x, image: undefined } : x);
  return { ...drop(c), groups: (c.groups ?? []).map((g) => ({ ...drop(g), ...(g.items ? { items: g.items.map(drop) } : {}) })) };
}

/**
 * An answer in the form its question takes: choice and matching → the letter or numeral only ("iv // Explaining the
 * inductive method" → "iv", "C to explain…" → "C", "B/C" kept), TRUE/FALSE/NOT GIVEN and YES/NO/NOT GIVEN written out,
 * completion: the key's "//" (= or) → "/".
 */
export function fitAnswer(g: Group, n: number, a: string): string {
  // "B // are strongly linked to cigarette smoking": the key's letter, then the option's words – also when the group
  // has no option list (options kept in the instructions or text)
  const lettered = a.match(/^\s*([A-Z]{1,3}|[ivxlc]{1,6})\s*\/\/\s*\S/);
  if (lettered) return lettered[1];
  if (g.type === "gap") return a.replace(/\s*\/\/\s*/g, "/");
  if (g.type === "tfng" || g.type === "ynng") {
    const v = a.trim().toUpperCase().replace(/\s+/g, " ");
    const full: Record<string, string> = g.type === "tfng" ? { T: "TRUE", F: "FALSE", NG: "NOT GIVEN" } : { Y: "YES", N: "NO", NG: "NOT GIVEN" };
    return full[v] ?? v;
  }
  const opts = g.type === "match" ? g.options : g.items?.find((it) => it.n.includes(n))?.options;
  const keys = new Set((opts ?? []).map((o) => o.key));
  if (!keys.size) return a;
  // each "/" alternative starts with its letter; the words after it are the option's text
  const found = [...new Set(a.split("/").map((alt) => alt.trim().split(/[\s.,;:)(]+/)[0]).filter((k) => keys.has(k)))];
  return found.length ? found.join("/") : a;
}
export function fitAnswers(c: SectionContent, answers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(answers).map(([n, a]) => {
      const g = c.groups?.find((x) => Number(n) >= x.from && Number(n) <= x.to);
      return [n, g ? fitAnswer(g, Number(n), String(a)) : a];
    }),
  );
}

/** Question numbers a section asks, in order. */
export const numbersOf = (c: SectionContent) => c.groups.flatMap((g) => numbersOfGroup(g));
export function numbersOfGroup(g: Pick<Group, "from" | "to">): number[] {
  const out: number[] = [];
  for (let n = g.from; n <= g.to; n++) out.push(n);
  return out;
}

/* ---------- plain-text formats used by the review editor (they read like the book) ---------- */

/** "A travel expenses" / "A. travel" / "A) travel" → option; other lines are null. */
/** `codes`: a matching list may use short codes ("AT Artefact Types"); under a question only one letter is an option. */
function optionLine(line: string, codes = false): Option | null {
  const m = line.match(codes ? /^\s*([A-Z]{1,3}|[ivxlc]+)[.)]?\s+(.+)$/ : /^\s*([A-Z]|[ivxlc]+)[.)]?\s+(.+)$/);
  return m ? { key: m[1], text: m[2].trim() } : null;
}

/** Options list: one "A text" per line. */
export const parseOptions = (s: string): Option[] => s.split("\n").map((l) => optionLine(l, true)).filter((o): o is Option => !!o);
export const formatOptions = (os: Option[] = []) => os.map((o) => `${o.key} ${o.text}`).join("\n");

/**
 * Questions: a line starting with a number (or "21-22" / "21&22" for choose-two) starts a question;
 * following "A …" lines are its options. Blank lines are ignored.
 */
export function parseItems(s: string): Item[] {
  const items: Item[] = [];
  for (const raw of s.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const q = line.match(/^(\d{1,2})(?:\s*(?:-|–|&|and)\s*(\d{1,2}))?[.)]?\s+(.*)$/);
    if (q) {
      const a = Number(q[1]);
      const b = q[2] ? Number(q[2]) : a;
      const n: number[] = [];
      for (let k = a; k <= Math.max(a, b); k++) n.push(k);
      items.push({ n, q: q[3].trim() });
      continue;
    }
    const o = optionLine(line);
    const last = items[items.length - 1];
    if (o && last) (last.options ??= []).push(o);
    else if (last) last.q += ` ${line}`;
  }
  return items;
}
export function formatItems(items: Item[] = []): string {
  return items
    .map((it) => {
      const head = `${it.n.length > 1 ? `${it.n[0]}-${it.n[it.n.length - 1]}` : it.n[0]} ${it.q}`;
      return [head, ...(it.options ?? []).map((o) => `${o.key} ${o.text}`)].join("\n");
    })
    .join("\n\n");
}

/** Answer key: "1 10/ten" per line. */
export function parseAnswers(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of s.split("\n")) {
    const m = line.trim().match(/^(\d{1,2})[.):]?\s+(.+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
export const formatAnswers = (a: Record<string, string>) =>
  Object.keys(a)
    .sort((x, y) => Number(x) - Number(y))
    .map((k) => `${k} ${a[k]}`)
    .join("\n");

/** Pieces of a gap-fill line: text and blanks ([[7]]). */
export function splitBlanks(line: string): (string | number)[] {
  return line.split(/\[\[(\d{1,2})\]\]/).map((p, i) => (i % 2 ? Number(p) : p));
}

/**
 * Table rows "| a | b |" → rows of cells, each cell its printed lines. A book cell often holds several lines (bullets):
 * written "<br>" inside the cell, or – by older imports – as extra rows whose first cell is empty; those rows are
 * folded back into the row above, so one cell never shows as two. Every row gets the header's number of cells.
 */
export function parseTable(lines: string[]): string[][][] {
  const rows: string[][] = [];
  for (const raw of lines) {
    const cells = raw.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // | --- | --- |
    rows.push(cells);
  }
  if (!rows.length) return [];
  const cols = rows[0].length;
  const fit = (r: string[]) => (r.length > cols ? [...r.slice(0, cols - 1), r.slice(cols - 1).join(" ")] : [...r, ...Array(cols - r.length).fill("")]);
  const out: string[][] = [fit(rows[0])];
  for (const r of rows.slice(1).map(fit)) {
    const prev = out[out.length - 1];
    // a continuation line of the row above (its first cell is empty), not the header
    if (!r[0] && out.length > 1 && r.some(Boolean)) r.forEach((c, i) => c && (prev[i] = prev[i] ? `${prev[i]}<br>${c}` : c));
    else out.push(r);
  }
  // each cell's lines: "<br>" breaks, and "• a • b" written on one line becomes two bullets
  return out.map((r) =>
    r.map((c) =>
      c
        .split(/<br\s*\/?>/i)
        .flatMap((l) => l.split(/\s+(?=[•▪]\s)/))
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  );
}
