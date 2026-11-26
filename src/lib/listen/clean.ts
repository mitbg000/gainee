/**
 * "Làm sạch" on the review screen, without AI: sound tags out ((Applause), [Music], ♪ … ♪, >>), speaker labels
 * ("Chris Anderson:", "CA:") moved from the words to the speaker field, very short sentences joined to a neighbour.
 * Sentences are never cut here, so their times stay the caption times.
 */

export type CleanRow = { start: number; end: number; text: string; speaker: string | null; hidden: boolean };
export type CleanReport = { tags: number; labels: number; joined: number; removed: number };

const TAG = /\[[^\]]{0,40}\]|\((?:[A-Z][\w' -]{0,30})\)|♪[^♪]{0,200}♪|[♪♫🎵🎶]|>>+/g;
// "Elon Musk:", "Chris Anderson:", "CA:", "EM:" – before a colon, at the start or after a space / end of sentence
const LABEL = /(^|[\s.!?,;—–-])((?:[A-Z][a-z'’]+(?: [A-Z][a-z'’]+){0,2})|[A-Z]{1,4}):(?=\s|$)/g;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const initials = (name: string) => name.split(" ").map((w) => w[0]).join("");

/**
 * Which "Name:" are speaker labels: names of two or three words always; one word or initials only when they come
 * back (twice or more) or are the initials of a full name ("EM" for "Elon Musk") – "Remember: …" in speech is not one.
 */
function speakers(rows: CleanRow[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const r of rows) for (const m of r.text.matchAll(LABEL)) count.set(m[2], (count.get(m[2]) ?? 0) + 1);
  const full = [...count.keys()].filter((k) => k.includes(" "));
  const out = new Map<string, string>();
  for (const [k, n] of count) {
    const name = full.find((f) => initials(f) === k);
    if (k.includes(" ")) out.set(k, k);
    else if (name) out.set(k, name);
    else if (n >= 2 && k !== "I") out.set(k, k);
  }
  return out;
}

const tidy = (s: string) =>
  s
    .replace(/\s*--+\s*/g, " — ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s—–,;:-]+|[\s—–,;:-]+$/g, "")
    .trim();

export function clean<T extends CleanRow>(rows: T[], minWords = 4, maxWords = 25): { rows: T[]; report: CleanReport } {
  const report: CleanReport = { tags: 0, labels: 0, joined: 0, removed: 0 };
  const names = speakers(rows);
  let current: string | null = null;
  const out: T[] = [];
  for (const r of rows) {
    let text = r.text.replace(TAG, () => (report.tags++, " "));
    let speaker = r.speaker ?? current;
    let first = true;
    text = text.replace(LABEL, (m, before: string, label: string, at: number) => {
      const name = names.get(label);
      if (!name) return m;
      report.labels++;
      // a label at the very start names this sentence's speaker; later ones the speaker from there on
      if (first && !text.slice(0, at).trim()) speaker = r.speaker ?? name;
      first = false;
      current = name;
      return before;
    });
    text = tidy(text);
    if (!text) {
      report.removed++;
      continue;
    }
    out.push({ ...r, text, speaker: speaker ?? null });
  }

  // very short sentences go onto the one before (same speaker, close in time), else onto the next
  const joined: T[] = [];
  for (let i = 0; i < out.length; i++) {
    const r = out[i];
    const prev = joined[joined.length - 1];
    const fits = (a: T, b: T) => !a.hidden && !b.hidden && (a.speaker ?? null) === (b.speaker ?? null) && b.start - a.end < 1.5 && words(a.text) + words(b.text) <= maxWords;
    if (words(r.text) < minWords && prev && fits(prev, r)) {
      joined[joined.length - 1] = { ...prev, end: r.end, text: `${prev.text} ${r.text}` };
      report.joined++;
    } else if (words(r.text) < minWords && out[i + 1] && fits(r, out[i + 1])) {
      out[i + 1] = { ...out[i + 1], start: r.start, text: `${r.text} ${out[i + 1].text}` };
      report.joined++;
    } else joined.push(r);
  }
  return { rows: joined, report };
}
