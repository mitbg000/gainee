/** Rules of a quick round: which kind of question comes next, when a word is known, and the FSRS rating it earns. */

export type Kind = "meaning" | "term" | "cloze" | "listen" | "type";
export type Progress = {
  first?: { kind: Kind; ms: number; right: boolean }; // the first answer of the round: what FSRS is told
  wrong: boolean; // wrong at least once in the round
  streak: Kind[]; // kinds answered right in a row (reset by a wrong answer)
  lastWrong: boolean;
  graded: boolean;
};

/** Kinds that make you bring the word back yourself, not only recognise it. */
const RECALL: Kind[] = ["cloze", "listen", "type"];
/** Slower than this (ms) on the first answer: remembered, but with effort. */
export const SLOW = 8000;

/** Questions by how well the word is known: 0 new or shaky, 1 learning, 2 well known (typing only then). */
const BY_STAGE: Kind[][] = [
  ["meaning", "term", "cloze", "listen"],
  ["term", "cloze", "listen"],
  ["cloze", "listen", "type"],
];

/** Known for this round: two right answers in a row, of two kinds, one of them a recall. */
export const wordDone = (p: Progress) => p.streak.length >= 2 && new Set(p.streak.slice(-2)).size === 2 && p.streak.slice(-2).some((k) => RECALL.includes(k));

export function nextKind(p: Progress | undefined, stage: number, hasSentence: boolean, rand = Math.random): Kind {
  const ok = BY_STAGE[stage].filter((k) => k !== "cloze" || hasSentence);
  if (!p) return ok[0];
  // after a mistake: the easiest kind again
  if (p.lastWrong) return stage === 2 ? "term" : "meaning";
  const last = p.streak.at(-1);
  // a recognition answered right: now recall it
  const pick = p.streak.some((k) => RECALL.includes(k)) ? ok.filter((k) => k !== last) : ok.filter((k) => RECALL.includes(k) && k !== last);
  const from = pick.length ? pick : ok.filter((k) => k !== last);
  return from[Math.floor(rand() * from.length)] ?? ok[0];
}

/** FSRS rating from the round: 1 Again if ever wrong, 2 Hard when slow, 4 Easy when a known word is recalled fast, else 3 Good. */
export function ratingOf(p: Progress, stage: number): 1 | 2 | 3 | 4 {
  if (p.wrong || !p.first) return 1;
  if (p.first.ms > SLOW) return 2;
  if (stage === 2 && RECALL.includes(p.first.kind)) return 4;
  return 3;
}
