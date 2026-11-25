/** Marking like the official answer keys, and raw score → band. Pure functions (used on server and client). */
import type { Group, SectionContent } from "./types";

const clean = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // café → cafe
    .replace(/[’`]/g, "'")
    .replace(/[£$€,]/g, "")
    .replace(/(\d)[:.](\d)/g, "$1.$2") // 7:30 = 7.30
    .replace(/[.;!?"]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Accepted spellings of one key entry:
 *  "10/ten" → 10 | ten,  "metal(s)" → metal | metals,  "(the) dentist" → dentist | the dentist,
 *  "NOT GIVEN"/"NG", "TRUE"/"T", "YES"/"Y" all accepted.
 */
export function accepted(key: string): string[] {
  const out = new Set<string>();
  for (const alt of key.split(/\s*\/\s*|\s+\bOR\b\s+/)) {
    const withParens = alt.replace(/[()]/g, "");
    const without = alt.replace(/\([^)]*\)/g, "");
    for (const v of [withParens, without]) if (clean(v)) out.add(clean(v));
  }
  const tf: Record<string, string> = { true: "t", false: "f", "not given": "ng", notgiven: "ng", yes: "y", no: "n" };
  for (const v of [...out]) if (tf[v]) out.add(tf[v]);
  return [...out];
}

export const isRight = (given: string | undefined, key: string | undefined) => {
  if (!given || !key) return false;
  const g = clean(given);
  const short: Record<string, string> = { true: "t", false: "f", "not given": "ng", yes: "y", no: "n" };
  return accepted(key).includes(short[g] ?? g) || accepted(key).includes(g);
};

export type Answers = Record<string, string>;
/** n → right? For "choose TWO" items the picks are compared as a set, in any order (as the book's "IN EITHER ORDER"). */
export function markGroup(g: Group, given: Answers, key: Answers): Record<number, boolean> {
  const out: Record<number, boolean> = {};
  const multi = new Set<number>();
  if (g.type === "multi")
    for (const it of g.items ?? []) {
      if (it.n.length < 2) continue;
      const keys = it.n.map((n) => clean(key[n] ?? ""));
      const picks = it.n.map((n) => clean(given[n] ?? "")).filter(Boolean);
      const left = [...keys];
      const hits = picks.filter((p) => {
        const i = left.indexOf(p);
        if (i < 0) return false;
        left.splice(i, 1);
        return true;
      }).length;
      it.n.forEach((n, i) => ((out[n] = i < hits), multi.add(n)));
    }
  for (let n = g.from; n <= g.to; n++) if (!multi.has(n)) out[n] = isRight(given[n], key[n]);
  return out;
}

export function markSection(c: SectionContent, given: Answers, key: Answers, onlyGroup?: number) {
  const marks: Record<number, boolean> = {};
  c.groups.forEach((g, i) => {
    if (onlyGroup === undefined || onlyGroup === i) Object.assign(marks, markGroup(g, given, key));
  });
  return marks;
}

/* ---------- band tables (published Cambridge/IELTS conversion, Academic Reading) ---------- */
const LISTENING: [number, number][] = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1]];
const READING: [number, number][] = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1]];

/** Band for a raw score; a part of a test is scaled to 40 first (an estimate). */
export function band(skill: "listening" | "reading", score: number, total = 40): number {
  if (!total) return 0;
  const raw = Math.round((score / total) * 40);
  return (skill === "listening" ? LISTENING : READING).find(([min]) => raw >= min)?.[1] ?? 0;
}

/** Overall band: mean of the skills, rounded to the nearest half (x.25 → x.5, x.75 → x+1, as IELTS does). */
export const overall = (bands: number[]) => (bands.length ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 2 + 1e-9) / 2 : 0);
