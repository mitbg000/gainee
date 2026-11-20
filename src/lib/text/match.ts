/** Loose text matching used to check AI output against the source text. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // coördination → coordination
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive occurrence of `needle` in `hay` (both normalized). */
export function containsWord(hay: string, needle: string): boolean {
  const n = normalizeForMatch(needle);
  if (!n) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, "u").test(normalizeForMatch(hay));
}

/** A quote is "found" if every part between "..." appears verbatim (after normalization). */
export function containsQuote(hay: string, quote: string | null | undefined): boolean {
  if (!quote) return false;
  const h = normalizeForMatch(hay);
  const parts = normalizeForMatch(quote)
    .replace(/^["']|["']$/g, "")
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((p) => p.replace(/^["'\s]+|["'\s]+$/g, ""))
    .filter((p) => p.length >= 4);
  return parts.length > 0 && parts.every((p) => h.includes(p));
}

/** The sentence of `text` that contains `needle` (for vocabulary context). */
export function sentenceContaining(paragraphs: string[], needle: string): string | null {
  for (const p of paragraphs) {
    if (!containsWord(p, needle)) continue;
    const sentences = p.split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/);
    return sentences.find((s) => containsWord(s, needle)) ?? p;
  }
  return null;
}
