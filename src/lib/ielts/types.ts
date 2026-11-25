/**
 * IELTS question content, shared by the importer, the review editor, practice and the mock test.
 * Kept as JSON on ielts_sections.content; answers live apart in ielts_sections.answers ({"1":"10/ten", "8":"TRUE"}).
 */
export const GROUP_TYPES = ["gap", "mcq", "multi", "tfng", "ynng", "match"] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

export type Option = { key: string; text: string };
/** One question; `n` has two or more numbers only for "choose TWO/THREE letters" (multi). */
export type Item = { n: number[]; q: string; options?: Option[] };

export type Group = {
  type: GroupType;
  from: number;
  to: number;
  /** "Complete the notes below. Write ONE WORD ONLY for each answer." */
  instructions: string;
  /** gap: notes / table / summary / form with blanks written [[7]]. Lines: "# heading", "- bullet", "| a | b |" table rows. */
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

/** Question numbers a section asks, in order. */
export const numbersOf = (c: SectionContent) => c.groups.flatMap((g) => numbersOfGroup(g));
export function numbersOfGroup(g: Pick<Group, "from" | "to">): number[] {
  const out: number[] = [];
  for (let n = g.from; n <= g.to; n++) out.push(n);
  return out;
}

/* ---------- plain-text formats used by the review editor (they read like the book) ---------- */

/** "A travel expenses" / "A. travel" / "A) travel" → option; other lines are null. */
function optionLine(line: string): Option | null {
  const m = line.match(/^\s*([A-Z]|[ivxlc]+)[.)]?\s+(.+)$/);
  return m ? { key: m[1], text: m[2].trim() } : null;
}

/** Options list: one "A text" per line. */
export const parseOptions = (s: string): Option[] => s.split("\n").map(optionLine).filter((o): o is Option => !!o);
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
