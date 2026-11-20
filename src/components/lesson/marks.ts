/** Split a paragraph into segments so highlights, vocabulary and "flash" marks never nest. */
export type MarkKind = "ann" | "vocab" | "flash" | "fmt"; // fmt: color "b" = bold, "i" = italic
export type Mark = { start: number; end: number; kind: MarkKind; id: number; color?: string };
export type Segment = { text: string; start: number; end: number; marks: Mark[] };

export function segments(text: string, marks: Mark[]): Segment[] {
  const cuts = new Set([0, text.length]);
  for (const m of marks) {
    cuts.add(Math.max(0, Math.min(text.length, m.start)));
    cuts.add(Math.max(0, Math.min(text.length, m.end)));
  }
  const pts = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [s, e] = [pts[i], pts[i + 1]];
    if (e <= s) continue;
    out.push({ text: text.slice(s, e), start: s, end: e, marks: marks.filter((m) => m.start <= s && m.end >= e) });
  }
  return out;
}

/** Length-preserving normalisation for searching (curly quotes → straight, lower case). */
export const searchable = (s: string) => s.toLowerCase().replace(/[’‘ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** All whole-word occurrences of `needle` in `text`. */
export function findAll(text: string, needle: string): [number, number][] {
  const n = searchable(needle).trim();
  if (!n) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(n)}(?![\\p{L}\\p{N}])`, "gu");
  const hay = searchable(text);
  const out: [number, number][] = [];
  for (let m = re.exec(hay); m; m = re.exec(hay)) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** Locate an evidence quote (may contain "..."); returns paragraph index + range of its first part. */
export function locateQuote(paragraphs: string[], quote: string): { p: number; start: number; end: number } | null {
  const part = searchable(quote)
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .split(/\s*(?:\.\.\.|…)\s*/)[0]
    .trim();
  if (part.length < 4) return null;
  for (let p = 0; p < paragraphs.length; p++) {
    const hay = searchable(paragraphs[p]).replace(/\s+/g, " ");
    const i = hay.indexOf(part.replace(/\s+/g, " "));
    if (i >= 0) return { p, start: i, end: i + part.length };
  }
  return null;
}

/** Character offset of (node, offset) inside a paragraph element. */
export function offsetIn(container: Element, node: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(container, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

/** Sentence around a character range (for AI context / saved words). */
export function sentenceAt(text: string, start: number, end: number): string {
  const before = text.slice(0, start);
  const s = Math.max(0, ...[". ", "! ", "? ", "” ", '" '].map((d) => before.lastIndexOf(d) + (before.lastIndexOf(d) >= 0 ? 2 : 0)));
  const after = text.slice(end).search(/[.!?](\s|$)/);
  return text.slice(s, after >= 0 ? end + after + 1 : text.length).trim();
}
