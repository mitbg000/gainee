/**
 * Clean extracted text into paragraphs:
 *  - drop page numbers and running headers/footers that repeat on many pages
 *  - re-join lines into paragraphs (blank lines, or short lines ending a sentence)
 *  - remove end-of-line hyphenation ("peda-\ngogy" → "pedagogy", but keep "self-critical")
 *  - merge paragraphs split across a page break
 */
/** Ends a sentence? Looks past closing quotes/brackets: `said.”` yes, `them,”` no. */
function isTerminal(s: string) {
  return /[.!?:…♦■]$/.test(s.replace(/["”’')\]\s]+$/, ""));
}

function normalizeLine(s: string) {
  return s
    .replace(/ /g, " ")
    .replace(/[​­﻿]/g, "")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function isNoise(line: string) {
  return /^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i.test(line) || /^[-–—_=*•·\s]+$/.test(line);
}

function repeatedLines(pages: string[][]): Set<string> {
  if (pages.length < 3) return new Set();
  const counts = new Map<string, number>();
  for (const lines of pages) {
    const edges = new Set([...lines.slice(0, 2), ...lines.slice(-2)].map((l) => l.replace(/\d+/g, "#")));
    for (const e of edges) if (e.length > 2) counts.set(e, (counts.get(e) || 0) + 1);
  }
  const min = Math.max(3, Math.ceil(pages.length * 0.4));
  return new Set([...counts].filter(([, n]) => n >= min).map(([l]) => l));
}

export function cleanToParagraphs(pagesRaw: string[]): string[] {
  const pages = pagesRaw.map((p) => p.split(/\r?\n/).map(normalizeLine));
  const repeated = repeatedLines(pages.map((ls) => ls.filter(Boolean)));

  // typical line length → detect short "last lines" of paragraphs when there are no blank lines
  const lens = pages.flat().filter((l) => l.length > 20).map((l) => l.length).sort((a, b) => a - b);
  const typical = lens.length ? lens[Math.floor(lens.length * 0.6)] : 80;
  const plain = pagesRaw.length === 1 && !/\n\s*\n/.test(pagesRaw[0]); // pasted text without blank lines

  const allText = pages.flat().join(" ");
  const paras: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) paras.push(cur.trim());
    cur = "";
  };

  pages.forEach((lines, pageIdx) => {
    lines.forEach((line, i) => {
      if (!line) return flush();
      if (isNoise(line) || repeated.has(line.replace(/\d+/g, "#"))) return;
      if (plain) {
        cur = line;
        return flush();
      }
      if (!cur) cur = line;
      else if (/[A-Za-z]-$/.test(cur) && /^[a-z]/.test(line)) {
        // hyphenated line break: drop the hyphen only if the joined word exists elsewhere
        const head = cur.match(/([A-Za-z]+)-$/)![1];
        const tail = line.match(/^([a-z]+)/)![1];
        const joined = head + tail;
        cur = new RegExp(`\\b${joined}\\b`, "i").test(allText) ? cur.slice(0, -1) + line : cur + line;
      } else if (/[—–]$/.test(cur)) cur += line;
      else cur += " " + line;

      const next = lines[i + 1];
      const nextStartsBlock = next !== undefined && /^[“"'‘(A-Z0-9]/.test(next || "");
      const shortEnd = isTerminal(line) && line.length < typical * 0.8;
      const heading = !isTerminal(line) && line.length < typical * 0.6 && !/[,;—–-]$/.test(line); // titles, bylines
      if (nextStartsBlock && (shortEnd || heading || /^https?:\/\//.test(line))) flush();
    });
    // page break: keep the paragraph open only if it does not end a sentence
    if (cur && isTerminal(cur) && pageIdx < pages.length - 1) flush();
  });
  flush();

  // merge fragments created by page breaks / headers
  const merged: string[] = [];
  for (const p of paras) {
    const prev = merged[merged.length - 1];
    // a paragraph starting in lower case continues the previous one (page break, header removed…)
    if (prev && (/^[a-z]/.test(p) || (!isTerminal(prev) && /^[(“"‘]/.test(p)))) merged[merged.length - 1] = prev + (/[-—–]$/.test(prev) ? "" : " ") + p;
    else merged.push(p);
  }
  return merged.filter((p) => !/^https?:\/\/\S+$/.test(p) && (p.split(/\s+/).length >= 3 || /[.!?]$/.test(p)));
}

export const wordCount = (s: string) => (s.match(/[\p{L}\p{N}’'-]+/gu) || []).length;
