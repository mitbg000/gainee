/**
 * Listening and Reading always have questions 1-40 in a test. When the AI took too few pages for a part, some numbers
 * are missing: these helpers find them (book page warnings, and the worker re-reads those parts with more pages).
 */
import { numbersOfGroup } from "./types";

type G = { from: number; to: number };

export const numsOf = (groups: G[]) => groups.flatMap(numbersOfGroup);

/** Numbers of 1-40 no part of the skill has. */
export const missing = (parts: { groups: G[] }[]) => {
  const have = new Set(parts.flatMap((p) => numsOf(p.groups)));
  return Array.from({ length: 40 }, (_, k) => k + 1).filter((n) => !have.has(n));
};

/** Numbers two parts both hold (a part also took its neighbour's questions). */
export const duplicates = (parts: { groups: G[] }[]) => {
  const all = parts.flatMap((p) => [...new Set(numsOf(p.groups))]);
  return [...new Set(all.filter((n, i) => all.indexOf(n) !== i))];
};

/** Questions a part should hold: after the previous parts' last question, before the next parts' first. */
export function expectedRange(parts: { part: number; groups: G[] }[], part: number): [number, number] {
  const before = parts.filter((p) => p.part < part).flatMap((p) => numsOf(p.groups));
  const after = parts.filter((p) => p.part > part).flatMap((p) => numsOf(p.groups));
  return [before.length ? Math.max(...before) + 1 : 1, after.length ? Math.min(...after) - 1 : 40];
}

/** Numbers in [lo, hi] the groups do not cover. */
export const gaps = (groups: G[], [lo, hi]: [number, number]) => {
  const have = new Set(numsOf(groups));
  return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, k) => lo + k).filter((n) => !have.has(n));
};

/** [18,19,20,31,32] → "18–20, 31–32" */
export function spans(ns: number[]): string {
  const out: string[] = [];
  for (const n of [...ns].sort((a, b) => a - b)) {
    const last = out.at(-1);
    const [a, b = a] = last?.split("–").map(Number) ?? [];
    if (last && n === b + 1) out[out.length - 1] = `${a}–${n}`;
    else out.push(String(n));
  }
  return out.join(", ");
}

/** A Reading passage this short was cut off (a real one is 700+ words). */
export const thinPassage = (passage?: string) => (passage?.length ?? 0) < 2000;

export type Slot = { skill: "listening" | "reading" | "writing"; part: number; pages: [number, number] };
const ORDER = ["listening", "reading", "writing"];

/** Parts of a test in book order: Listening 1-4, Reading 1-3, Writing 1-2. */
export const inBookOrder = <T extends { skill: string; part: number }>(xs: T[]) => [...xs].sort((a, b) => ORDER.indexOf(a.skill) - ORDER.indexOf(b.skill) || a.part - b.part);

export const nameOf = ({ skill, part }: { skill: string; part: number }) => (skill === "listening" ? `Listening Part ${part}` : skill === "reading" ? `Reading Passage ${part}` : `Writing Task ${part}`);

/**
 * A part often starts on the page where the previous one ends and runs onto the page where the next one starts, so
 * page ranges guessed from page headers cut off its beginning or end. Each range is widened to the pages it shares with
 * its neighbours (at most 1 page back, 3 pages on); the AI is told which neighbour parts to leave out.
 */
export function sharedPages(slots: Slot[], lastPage: number): Slot[] {
  return slots.map((s, i) => {
    const prev = slots[i - 1];
    const next = slots[i + 1];
    const [a, b] = s.pages;
    const from = prev ? Math.max(1, a - 1, Math.min(a, prev.pages[1])) : a;
    const to = Math.min(lastPage, b + 3, Math.max(b, next ? next.pages[0] : b + 1));
    return { ...s, pages: [from, to] };
  });
}
