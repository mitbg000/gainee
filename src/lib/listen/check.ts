/**
 * Dictation marking: the typed sentence against the expected one, word by word. Forgives what a listener cannot know
 * from sound (capitals, punctuation, "15" / "fifteen", "don't" / "do not") but not spelling.
 */

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const NUMBER_WORDS = new Set([...ONES, ...TENS.filter(Boolean), "hundred", "thousand", "million", "point", "oh"]);

/** 1 → ["one"], 250 → ["two","hundred","fifty"] ("and" is dropped on both sides, see `tokens`). */
function numberWords(n: number): string[] {
  if (n < 20) return [ONES[n]];
  if (n < 100) return [TENS[Math.floor(n / 10)], ...(n % 10 ? [ONES[n % 10]] : [])];
  if (n < 1000) return [ONES[Math.floor(n / 100)], "hundred", ...(n % 100 ? numberWords(n % 100) : [])];
  if (n < 1_000_000) return [...numberWords(Math.floor(n / 1000)), "thousand", ...(n % 1000 ? numberWords(n % 1000) : [])];
  return String(n).split("").map((d) => ONES[Number(d)]); // shortcut: very large numbers digit by digit, rare in listening
}
const ORDINAL: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
const ordinal = (w: string) => ORDINAL[w] ?? (w.endsWith("y") ? `${w.slice(0, -1)}ieth` : `${w}th`);

const SYMBOL: Record<string, string> = { "£": "pounds", $: "dollars", "€": "euros", "%": "percent" };

/** One written word → the tokens a listener could type for it. */
function wordTokens(raw: string): string[] {
  let w = raw.toLowerCase().replace(/[’‘ʼ`]/g, "'").replace(/[“”]/g, '"');
  const pre = w.match(/^[£$€]/)?.[0];
  const post = w.match(/%/)?.[0];
  w = w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "").replace(/^'+|'+$/g, "");
  if (!w) return [];
  const sym = [pre, post].filter(Boolean).map((s) => SYMBOL[s!]);
  // 9:30 / 9.30 → nine thirty; 2.5 → two point five; 1,500 → one thousand five hundred
  let m = w.match(/^(\d{1,2})[:.](\d{2})(am|pm)?$/);
  if (m) return [...numberWords(+m[1]), ...(+m[2] ? (m[2][0] === "0" ? ["oh", ...numberWords(+m[2])] : numberWords(+m[2])) : []), ...(m[3] ? [m[3]] : []), ...sym];
  m = w.match(/^(\d+)\.(\d+)$/);
  if (m) return [...numberWords(+m[1]), "point", ...m[2].split("").map((d) => ONES[+d]), ...sym];
  m = w.replace(/,(?=\d{3})/g, "").match(/^(\d+)(st|nd|rd|th|s|am|pm)?$/);
  if (m) {
    const ws = numberWords(+m[1]);
    if (m[2] && ["st", "nd", "rd", "th"].includes(m[2])) ws[ws.length - 1] = ordinal(ws[ws.length - 1]);
    else if (m[2] === "s") ws[ws.length - 1] = ws[ws.length - 1].replace(/y$/, "ie") + "s"; // 1990s → …nineties
    else if (m[2]) ws.push(m[2]);
    return [...ws, ...sym];
  }
  if (w === "cannot") return ["can", "not"];
  if (w === "won't") return ["will", "not"];
  if (w === "shan't") return ["shall", "not"];
  m = w.match(/^(.+)(n't|'re|'ve|'ll|'m|'d)$/);
  if (m) return [m[1], { "n't": "not", "'re": "are", "'ve": "have", "'ll": "will", "'m": "am", "'d": "'d" }[m[2]]!];
  return [...w.split(/[-/]+/).filter(Boolean), ...sym];
}

/** 'd is "would" or "had": either is right. */
const same = (a: string, b: string) => a === b || (a === "'d" && (b === "would" || b === "had")) || (b === "'d" && (a === "would" || a === "had"));

type Word = { text: string; toks: string[] };
/** Written words of a sentence with their tokens; "and" inside a number ("two hundred and fifty") is dropped. */
export function words(s: string): Word[] {
  const ws = s.split(/\s+/).filter(Boolean).map((text) => ({ text, toks: wordTokens(text) }));
  ws.forEach((w, i) => {
    const prev = ws[i - 1]?.toks.at(-1);
    const next = ws[i + 1]?.toks[0];
    if (w.toks.length === 1 && w.toks[0] === "and" && prev && next && NUMBER_WORDS.has(prev) && NUMBER_WORDS.has(next)) w.toks = [];
  });
  return ws;
}

export type Shown = { kind: "ok" | "wrong" | "extra"; text: string } | { kind: "missing"; n: number };
export const MISS_KINDS = ["function", "ending", "number", "name", "other"] as const;
export type MissKind = (typeof MISS_KINDS)[number];
export type Marked = {
  ok: boolean;
  /** the learner's words, coloured, with "___" where words are missing: never shows the expected text */
  shown: Shown[];
  /** per expected word: heard right or not (for hints and the gap mode) */
  right: boolean[];
  misses: Partial<Record<MissKind, number>>;
};

const FUNCTION = new Set("a an the of to in on at for from by with and or but so if as than that this these those is are was were be been am do does did have has had will would can could shall should may might must it its i you he she we they me him her us them my your his our their there here not no yes some any".split(" "));

function missKind(w: Word, first: boolean, typedNear: string[]): MissKind {
  const t = w.toks;
  if (/\d/.test(w.text) || t.some((x) => NUMBER_WORDS.has(x))) return "number";
  if (t.length === 1 && FUNCTION.has(t[0])) return "function";
  if (t.length === 1 && typedNear.some((x) => x !== t[0] && x.length > 2 && (t[0].replace(/(es|s|ed|d)$/, "") === x.replace(/(es|s|ed|d)$/, "")))) return "ending";
  if (!first && /^[A-Z]/.test(w.text.replace(/^[^\p{L}]+/u, "")) && w.text !== "I") return "name";
  return "other";
}

export function mark(expected: string, typed: string): Marked {
  const ew = words(expected);
  const tw = words(typed);
  const e = ew.flatMap((w, i) => w.toks.map((x) => ({ x, i })));
  const t = tw.flatMap((w, i) => w.toks.map((x) => ({ x, i })));
  // longest common subsequence of tokens
  const L = Array.from({ length: e.length + 1 }, () => new Int32Array(t.length + 1));
  for (let a = e.length - 1; a >= 0; a--) for (let b = t.length - 1; b >= 0; b--) L[a][b] = same(e[a].x, t[b].x) ? L[a + 1][b + 1] + 1 : Math.max(L[a + 1][b], L[a][b + 1]);
  const eOk = new Array(e.length).fill(false);
  const tState: ("ok" | "wrong" | "extra")[] = new Array(t.length).fill("extra");
  const missingAfter = new Map<number, number>(); // typed token index (-1 = before all) → expected tokens missing there
  let a = 0;
  let b = 0;
  let gapE: number[] = [];
  let gapT: number[] = [];
  const closeGap = () => {
    for (const k of gapT) tState[k] = gapE.length ? "wrong" : "extra";
    if (gapE.length > gapT.length) missingAfter.set(gapT.length ? gapT.at(-1)! : b - 1, gapE.length - gapT.length);
    gapE = [];
    gapT = [];
  };
  while (a < e.length || b < t.length) {
    if (a < e.length && b < t.length && same(e[a].x, t[b].x) && L[a][b] === L[a + 1][b + 1] + 1) {
      closeGap();
      eOk[a++] = true;
      tState[b++] = "ok";
    } else if (b < t.length && (a >= e.length || L[a][b + 1] >= L[a + 1][b])) gapT.push(b++);
    else gapE.push(a++);
  }
  closeGap();

  const right = ew.map((_, i) => e.every((x, k) => x.i !== i || eOk[k]));
  const shown: Shown[] = [];
  const lead = missingAfter.get(-1);
  if (lead) shown.push({ kind: "missing", n: lead });
  tw.forEach((w, i) => {
    const mine = t.map((x, j) => (x.i === i ? j : -1)).filter((j) => j >= 0);
    const kind = mine.some((j) => tState[j] === "wrong") ? "wrong" : mine.some((j) => tState[j] === "extra") ? "extra" : "ok";
    if (mine.length) shown.push({ kind, text: w.text });
    for (const j of mine) {
      const n = missingAfter.get(j);
      if (n) shown.push({ kind: "missing", n });
    }
  });
  const typedToks = t.map((x) => x.x);
  const misses: Partial<Record<MissKind, number>> = {};
  ew.forEach((w, i) => {
    if (right[i] || !w.toks.length) return;
    const kind = missKind(w, i === 0, typedToks);
    misses[kind] = (misses[kind] ?? 0) + 1;
  });
  return { ok: right.every(Boolean) && tState.every((s) => s === "ok"), shown, right, misses };
}

/** "Hiện chữ cái đầu": every word as its first letter and dots, punctuation kept ("T… w… 15 …"). */
export const firstLetters = (s: string) => s.replace(/(\p{L})(\p{L}|['’-]\p{L})+/gu, (m, c) => c + "·".repeat(Math.min(6, m.length - 1)));

/** Words to blank out in the gap mode: numbers, names and longer content words, about a third of the sentence. */
export function gapWords(s: string): number[] {
  const ws = words(s);
  const score = ws.map((w, i) => {
    if (!w.toks.length) return -1;
    const kind = missKind(w, i === 0, []);
    if (kind === "number" || kind === "name") return 3;
    if (kind === "function") return -1;
    return w.toks.join("").length >= 5 ? 2 : w.toks.join("").length >= 3 ? 1 : -1;
  });
  const want = Math.max(1, Math.round(ws.length / 3));
  return score
    .map((v, i) => [v, i] as const)
    .filter(([v]) => v > 0)
    .sort((x, y) => y[0] - x[0] || x[1] - y[1])
    .slice(0, want)
    .map(([, i]) => i)
    .sort((x, y) => x - y);
}

/** Gap mode: is the typed word the expected one? */
export function sameWord(expected: string, typed: string): boolean {
  const a = wordTokens(expected);
  const b = words(typed).flatMap((w) => w.toks);
  return a.length > 0 && a.length === b.length && a.every((x, i) => same(x, b[i]));
}
