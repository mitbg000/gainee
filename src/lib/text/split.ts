/** Split paragraphs into lesson-sized chunks at paragraph (or, if needed, sentence) boundaries. */
import { wordCount } from "./clean";

export function splitSentences(p: string): string[] {
  return p.split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/);
}

export function splitLessons(paragraphs: string[], target = 650): string[][] {
  const max = Math.round(target * 1.35);
  // break up very long paragraphs first
  const units: string[] = [];
  for (const p of paragraphs) {
    if (wordCount(p) <= max) {
      units.push(p);
      continue;
    }
    let buf = "";
    for (const s of splitSentences(p)) {
      if (buf && wordCount(buf) + wordCount(s) > target) {
        units.push(buf);
        buf = s;
      } else buf = buf ? `${buf} ${s}` : s;
    }
    if (buf) units.push(buf);
  }

  const lessons: string[][] = [];
  let cur: string[] = [];
  let words = 0;
  for (const u of units) {
    const w = wordCount(u);
    if (cur.length && (words + w > max || (words >= target && words + w > target * 1.15))) {
      lessons.push(cur);
      cur = [];
      words = 0;
    }
    cur.push(u);
    words += w;
  }
  if (cur.length) {
    if (lessons.length && words < target * 0.4) lessons[lessons.length - 1].push(...cur);
    else lessons.push(cur);
  }
  return lessons;
}
