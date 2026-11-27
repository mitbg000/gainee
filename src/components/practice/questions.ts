export type PWord = {
  id: number;
  term: string;
  ipa: string | null;
  pos: string | null;
  meaningVi: string | null;
  definitionEn: string | null;
  context: string | null;
  example?: string | null;
  mnemonic?: string | null;
  lapses?: number; // FSRS: times forgotten in review
  reps?: number;
  state?: number; // FSRS: 0 new, 1 learning, 2 review, 3 relearning
  scheduledDays?: number;
  due?: Date | string;
  images?: { id: number; url: string }[];
};
export const MODES = ["mix", "meaning", "term", "spell", "cloze"] as const;
export type Mode = (typeof MODES)[number];
type Kind = Exclude<Mode, "mix">;
export type Question = { kind: Kind; word: PWord; options?: string[]; answer: string; prompt?: string };

export const meaningOf = (w: { meaningVi?: string | null; definitionEn?: string | null }) => (w.meaningVi || w.definitionEn || "").trim();
export const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Context sentence with the word (and its inflected form) blanked, or null when the word is not in it. */
export function clozeOf(w: PWord): string | null {
  if (!w.context) return null;
  const re = new RegExp(`(?<![\\p{L}])${esc(w.term)}\\p{L}*`, "iu");
  return re.test(w.context) ? w.context.replace(re, "_____") : null;
}

/** 3 wrong options + the right one, in random order; null if there are not enough distinct values. */
export function options(right: string, pool: string[]): string[] | null {
  const others = shuffle([...new Set(pool.filter((x) => x && norm(x) !== norm(right)))]).slice(0, 3);
  return others.length < 3 ? null : shuffle([right, ...others]);
}

/** Pick the question type each word can support, falling back to spelling (always possible). */
function questionFor(w: PWord, kind: Kind, all: { term: string; meaning: string }[]): Question {
  const m = meaningOf(w);
  if (kind === "meaning" && m) {
    const o = options(m, all.map((x) => x.meaning));
    if (o) return { kind, word: w, options: o, answer: m };
  }
  if (kind === "term" && m) {
    const o = options(w.term, all.map((x) => x.term));
    if (o) return { kind, word: w, options: o, answer: w.term };
  }
  if (kind === "cloze") {
    const c = clozeOf(w);
    if (c) return { kind, word: w, prompt: c, answer: w.term };
  }
  return { kind: "spell", word: w, answer: w.term };
}

export function buildQuestions(words: PWord[], all: { term: string; meaning: string }[], mode: Mode, size: number): Question[] {
  const picked = shuffle(words).slice(0, size || words.length);
  const kinds: Kind[] = ["meaning", "term", "spell", "cloze"];
  return picked.map((w, i) => questionFor(w, mode === "mix" ? kinds[i % kinds.length] : mode, all));
}

/** Typed answers are compared loosely (case, curly quotes, spaces); for cloze an inflected form also counts. */
export function isRight(q: Question, given: string): boolean {
  if (norm(given) === norm(q.answer)) return true;
  if (q.kind === "cloze" && q.word.context) {
    const m = new RegExp(`(?<![\\p{L}])${esc(q.word.term)}\\p{L}*`, "iu").exec(q.word.context);
    return !!m && norm(given) === norm(m[0]);
  }
  return false;
}
