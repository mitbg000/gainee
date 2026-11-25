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
