/**
 * Cutting a recording into dictation sentences and listening chunks from timed words (YouTube captions, Whisper
 * aligned to an IELTS audioscript), and tidying the cut points.
 */
import { capsNames } from "./clean";

export type TWord = {
  w: string;
  s: number;
  e: number;
  speaker?: string | null;
  /** found in what Whisper heard */
  m?: boolean;
  /** last word of a caption line: with captions timed per line only these ends have a real time */
  c?: boolean;
};
export type Clip = { start: number; end: number; text: string; speaker: string | null; confidence: number | null };

const ENDS = /[.!?…]["'’”)\]]*$/;
const SOFT = /[,;:–—]["'’”)\]]*$/;
const JOIN = new Set(["and", "but", "because", "which", "who", "so", "when", "while", "although", "though", "where", "that", "or", "if"]);
const norm = (w: string) => w.toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}']/gu, "");

function clipOf(ws: TWord[]): Clip {
  const heard = ws.filter((w) => w.m !== undefined);
  return {
    start: ws[0].s,
    end: ws[ws.length - 1].e,
    text: ws.map((w) => w.w).join(" "),
    speaker: ws[0].speaker ?? null,
    confidence: heard.length ? Math.round((heard.filter((w) => w.m).length / heard.length) * 100) / 100 : null,
  };
}

/**
 * Where to cut a long sentence: after a comma or before a joining word, nearest the middle; the middle otherwise.
 * With line-timed captions only after a line's last word (-1: no such place, keep it whole).
 */
function cutAt(ws: TWord[], lines: boolean): number {
  const mid = ws.length / 2;
  let best = -1;
  let anyLine = -1;
  for (let i = 3; i <= ws.length - 3; i++) {
    if (lines && !ws[i - 1].c) continue;
    if (anyLine < 0 || Math.abs(i - mid) < Math.abs(anyLine - mid)) anyLine = i;
    const good = SOFT.test(ws[i - 1].w) || JOIN.has(norm(ws[i].w));
    if (good && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  if (best > 0) return best;
  return lines ? anyLine : Math.round(mid);
}

/**
 * Sentences for dictation: a cut after . ? !, at a change of speaker and at a long pause; longer than `maxWords` words or
 * `maxSec` seconds → cut again at a comma or joining word; shorter than 3 words → joined to the sentence before.
 */
export function toSentences(ws: TWord[], maxWords = 15, maxSec = 6): Clip[] {
  // captions timed per line: a time inside a line is only a guess, so sentences are cut where lines end (the audio
  // then always matches the words, even if a piece starts mid-sentence)
  const lines = ws.some((w) => w.c);
  const groups: TWord[][] = [];
  let cur: TWord[] = [];
  let ended = false; // a sentence ended inside the current caption line
  ws.forEach((w, i) => {
    cur.push(w);
    const next = ws[i + 1];
    ended ||= ENDS.test(w.w);
    if (lines && !w.c && next) return;
    if (!next || ended || (next.speaker ?? null) !== (w.speaker ?? null) || next.s - w.e > 1.0) {
      ended = false;
      groups.push(cur);
      cur = [];
    }
  });
  const fit: TWord[][] = [];
  const split = (g: TWord[]) => {
    const k = g.length >= 6 && (g.length > maxWords || g[g.length - 1].e - g[0].s > maxSec) ? cutAt(g, lines && g.length <= maxWords * 1.5 && g[g.length - 1].e - g[0].s <= maxSec * 2) : -1; // a very long line is cut anyway, on a guessed time
    if (k > 0) {
      split(g.slice(0, k));
      split(g.slice(k));
    } else fit.push(g);
  };
  groups.forEach(split);
  const out: TWord[][] = [];
  for (const g of fit) {
    const prev = out[out.length - 1];
    if (g.length < 3 && prev && (prev[0].speaker ?? null) === (g[0].speaker ?? null) && g[0].s - prev[prev.length - 1].e < 1.5) prev.push(...g);
    else out.push([...g]);
  }
  // a short opening piece goes onto the next one instead
  if (out.length > 1 && out[0].length < 3 && (out[1][0].speaker ?? null) === (out[0][0].speaker ?? null)) out.splice(0, 2, [...out[0], ...out[1]]);
  return out.map(clipOf);
}

/** Listen-only chunks: consecutive sentences joined into 20–40 s, cut at a change of speaker or a pause when long enough. */
export function toChunks<T extends { start: number; end: number; speaker: string | null }>(clips: T[], min = 20, max = 40): T[][] {
  const out: T[][] = [];
  for (const c of clips) {
    const g = out[out.length - 1];
    const len = g ? g[g.length - 1].end - g[0].start : 0;
    const last = g?.[g.length - 1];
    const breakHere = !g || c.end - g[0].start > max || (len >= min && (c.speaker !== last!.speaker || c.start - last!.end > 0.8));
    if (breakHere) out.push([c]);
    else g.push(c);
  }
  return out;
}

/** Timed words from caption cues that have no time per word: each word gets a share of its cue by length. */
export function cueWords(cues: { s: number; e: number; text: string; speaker?: string | null }[]): TWord[] {
  return cues.flatMap((c) => {
    const ws = c.text.split(/\s+/).filter(Boolean);
    const total = ws.reduce((a, w) => a + w.length + 1, 0);
    let at = c.s;
    return ws.map((w, k) => {
      const d = ((c.e - c.s) * (w.length + 1)) / total;
      const tw: TWord = { w, s: at, e: at + d, speaker: c.speaker ?? null, ...(k === ws.length - 1 ? { c: true, e: c.e } : {}) };
      at += d;
      return tw;
    });
  });
}

const STAMP = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/;
const secs = (m: RegExpMatchArray) => (Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number((m[4] ?? "0").padEnd(3, "0")) / 1000);

/**
 * Pasted transcript → cues. Reads SRT / WebVTT ("00:00:01,000 --> 00:00:04,000") and YouTube's "Show transcript"
 * copy ("0:04" on its own line or in front of the text).
 */
export function parseTimed(text: string): { s: number; e: number; text: string }[] {
  const cues: { s: number; e?: number; text: string }[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line || line === "WEBVTT" || /^\d+$/.test(line)) continue;
    const arrow = line.match(/^([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (arrow) {
      const a = arrow[1].match(STAMP);
      const b = arrow[2].match(STAMP);
      if (a && b) cues.push({ s: secs(a), e: secs(b), text: "" });
      continue;
    }
    const lead = line.match(/^((?:\d+:)?\d{1,2}:\d{2})\s*(.*)$/);
    const st = lead?.[1].match(STAMP);
    if (lead && st) {
      cues.push({ s: secs(st), text: lead[2] });
      continue;
    }
    if (/^\d+ (seconds?|minutes?|giây|phút)/i.test(line)) continue; // screen-reader labels YouTube copies along
    const last = cues[cues.length - 1];
    if (last) last.text = `${last.text} ${line.replace(/<[^>]+>/g, "")}`.trim();
  }
  return cues
    .filter((c) => c.text)
    .map((c, i, all) => ({ s: c.s, e: c.e ?? (all[i + 1]?.s ?? c.s + 4), text: c.text.replace(/\[(music|applause|laughter|âm nhạc|vỗ tay)\]/gi, "").replace(/\s+/g, " ").trim() }))
    .filter((c) => c.text);
}

/**
 * "WOMAN: Hello…" lines → words with their speaker (IELTS audioscripts). Names in capitals without a colon ("JOHN" on
 * its own line or at the end of the line before) also set the speaker and are not words.
 */
export function scriptWords(script: string): { w: string; speaker: string | null }[] {
  let speaker: string | null = null;
  const out: { w: string; speaker: string | null }[] = [];
  const lines = script.replace(/\r/g, "").split("\n");
  const caps = capsNames(lines);
  for (const raw of lines) {
    let line = raw.replace(/\(?\bQ\d{1,2}\b\)?/g, " ").trim(); // question numbers marked in the text ("twentieth Q31 century")
    const m = line.match(/^([A-Z][A-Z .'’-]{1,24}|[A-Z][a-z]+(?: [A-Z][a-z]+)?)\s*:\s+/);
    if (m) {
      speaker = m[1].trim();
      line = line.slice(m[0].length);
    }
    const ws = line.split(/\s+/).filter(Boolean);
    for (let k = 0; k < ws.length; k++) {
      const atEdge = k === 0 || ENDS.test(ws[k - 1]);
      const two = `${ws[k]} ${ws[k + 1]}`;
      if (atEdge && caps.has(two)) {
        speaker = two;
        k++;
      } else if (atEdge && caps.has(ws[k])) speaker = ws[k];
      else out.push({ w: ws[k], speaker });
    }
  }
  return out;
}

/**
 * Times for the script's words from what Whisper heard. The recording also has what the script leaves out (the
 * introduction, "now listen and answer questions 6 to 10", "that is the end of part 1", long pauses, a bit of the
 * part before or after), so a single common word ("you", "the") is no proof:
 * 1. matches count as sure only in runs of 3 or more words close together on both sides;
 * 2. a lone match is kept only when its time fits the sure ones around it;
 * 3. words still without a time are put at the speaker's pace next to the words they belong with (the end of a
 *    sentence after the words before, the rest before the words after), never spread over a pause or an announcement.
 * `m` tells which words were heard.
 */
export function align(script: { w: string; speaker: string | null }[], heard: TWord[]): TWord[] {
  const a = script.map((x) => norm(x.w));
  const b = heard.map((x) => norm(x.w));
  const n = a.length;
  const k = b.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(k + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = k - 1; j >= 0; j--) L[i][j] = a[i] && a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs: { i: number; j: number; sure: boolean }[] = [];
  for (let i = 0, j = 0; i < n && j < k; ) {
    if (a[i] && a[i] === b[j] && L[i][j] === L[i + 1][j + 1] + 1) {
      pairs.push({ i, j, sure: false });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }

  // 1. runs: neighbours at most 3 words apart in the script and in what was heard
  for (let t = 0; t < pairs.length; ) {
    let u = t + 1;
    while (u < pairs.length && pairs[u].i - pairs[u - 1].i <= 3 && pairs[u].j - pairs[u - 1].j <= 3) u++;
    if (u - t >= 3) for (let q = t; q < u; q++) pairs[q].sure = true;
    t = u;
  }
  if (!pairs.some((p) => p.sure)) pairs.forEach((p) => (p.sure = true)); // a very short part: take what there is

  // the speaker's pace (seconds per script word) inside the runs
  const steps: number[] = [];
  for (let t = 1; t < pairs.length; t++) {
    const [p, q] = [pairs[t - 1], pairs[t]];
    if (p.sure && q.sure && q.i - p.i <= 3 && q.j - p.j <= 3) steps.push((heard[q.j].s - heard[p.j].s) / (q.i - p.i));
  }
  steps.sort((x, y) => x - y);
  const pace = Math.min(0.8, Math.max(0.2, steps[Math.floor(steps.length / 2)] ?? 0.35));

  // 2. a lone match must be about where the pace puts it, seen from the sure matches before and after
  const fits = (p: { i: number; j: number }, q: { i: number; j: number }) => {
    const dt = heard[q.j].s - heard[p.j].s;
    return dt >= 0 && dt <= (q.i - p.i) * pace * 2 + 1.5;
  };
  const sure = pairs.filter((p) => p.sure);
  const kept = pairs.filter((p) => {
    if (p.sure) return true;
    const before = sure.findLast((s) => s.i < p.i);
    const after = sure.find((s) => s.i > p.i);
    return (!before || fits(before, p)) && (!after || fits(p, after));
  });

  const out: TWord[] = script.map((x) => ({ w: x.w, s: NaN, e: NaN, speaker: x.speaker, m: false }));
  for (const p of kept) out[p.i] = { ...out[p.i], s: heard[p.j].s, e: heard[p.j].e, m: true };

  // 3. the words still without a time
  const set = (q: number, s: number, e: number) => (out[q] = { ...out[q], s, e: Math.max(e, s) });
  for (let i = 0; i < n; ) {
    if (out[i].m) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && !out[j].m) j++;
    const prev = i > 0 ? out[i - 1] : null;
    const next = j < n ? out[j] : null;
    if (!prev && !next) {
      // nothing heard matched: spread over the recording
      const from = heard[0]?.s ?? 0;
      const step = Math.max(0, (heard[k - 1]?.e ?? 0) - from) / n;
      for (let q = 0; q < n; q++) set(q, from + step * q, from + step * (q + 1));
      break;
    }
    const from = prev?.e ?? -Infinity;
    const to = next?.s ?? Infinity;
    if (prev && next && to - from <= (j - i) * pace * 1.8 + 1) {
      const step = Math.max(0, to - from) / (j - i);
      for (let q = i; q < j; q++) set(q, from + step * (q - i), from + step * (q - i + 1));
    } else {
      // a pause or an announcement in between: the rest of a sentence goes after `prev`, the others before `next`
      let h = i;
      if (!next) h = j;
      else if (prev && !ENDS.test(prev.w)) {
        h = i;
        while (h < j && !ENDS.test(out[h].w)) h++;
        h = h < j ? h + 1 : j;
      }
      for (let q = i; q < h; q++) set(q, Math.min(from + pace * (q - i), to), Math.min(from + pace * (q - i + 1), to));
      for (let q = h; q < j; q++) set(q, Math.max(to - pace * (j - q), from, 0), Math.max(to - pace * (j - q - 1), from, 0));
    }
    i = j;
  }
  return out;
}

/** Quiet stretches [from, to] in seconds (frames of 50 ms under a threshold taken from the recording itself). */
export function silences(pcm: Float32Array, rate: number, minGap = 0.25): [number, number][] {
  const frame = Math.floor(rate * 0.05);
  const rms: number[] = [];
  for (let i = 0; i + frame <= pcm.length; i += frame) {
    let sum = 0;
    for (let q = i; q < i + frame; q++) sum += pcm[q] * pcm[q];
    rms.push(Math.sqrt(sum / frame));
  }
  const sorted = [...rms].sort((x, y) => x - y);
  const pct = (p: number) => sorted[Math.floor(p * (sorted.length - 1))] ?? 0;
  const thr = Math.max(pct(0.1) * 2, pct(0.5) * 0.15, 1e-4);
  const out: [number, number][] = [];
  let from = -1;
  rms.forEach((v, i) => {
    if (v < thr && from < 0) from = i;
    if ((v >= thr || i === rms.length - 1) && from >= 0) {
      if ((i - from) * 0.05 >= minGap) out.push([from * 0.05, i * 0.05]);
      from = -1;
    }
  });
  return out;
}

/**
 * Cut points moved into the nearest quiet stretch (within 0.6 s) so a sentence never starts or ends inside a word;
 * a little air is left before and after the speech.
 */
export function snap<T extends { start: number; end: number }>(clips: T[], quiet: [number, number][]): T[] {
  const near = (t: number, pick: (q: [number, number]) => number) => {
    let best: number | null = null;
    for (const q of quiet) {
      const v = pick(q);
      if (Math.abs(v - t) <= 0.6 && (best === null || Math.abs(v - t) < Math.abs(best - t))) best = v;
    }
    return best;
  };
  return clips.map((c) => {
    const s = near(c.start, (q) => q[1]);
    const e = near(c.end, (q) => q[0]);
    const start = Math.max(0, (s ?? c.start) - 0.15);
    const end = (e ?? c.end) + 0.2;
    return { ...c, start: Math.round(start * 100) / 100, end: Math.round(Math.max(end, start + 0.5) * 100) / 100 };
  });
}

/** Spoken words per second: tells fast speech from slow. */
export const rate = (c: { start: number; end: number; text: string }) => Math.round((c.text.split(/\s+/).length / Math.max(0.5, c.end - c.start)) * 10) / 10;
