/**
 * Find where each Listening part starts in one recording of a whole test, in the browser:
 * a small speech model (Moonshine tiny, ~28 MB, cached by the browser after the first time) hears the few seconds after each
 * long pause and we look for the announcements "Part 2" / "Now turn to Section 2". Free, no server work.
 */
export type PartMarks = Record<string, number>; // part → second where its announcement starts

const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
/** Moonshine: compute grows with the clip length (Whisper always works on 30 s), so short clips are several times faster. */
export const MODEL = "onnx-community/moonshine-tiny-ONNX";
const RATE = 16000;

const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, "1": 1, "2": 2, "3": 3, "4": 4 };
const TEST_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** "Practice Test One. Section 1…" heard before the first part → 1 (which test a whole-test file belongs to). */
export function testNumber(clips: { start: number; text: string }[], firstPart?: number): number | null {
  for (const c of [...clips].sort((a, b) => a.start - b.start)) {
    if (firstPart !== undefined && c.start > firstPart + 30) break;
    const m = c.text.match(/\btest\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/i);
    if (m) return TEST_NUM[m[1].toLowerCase()] ?? Number(m[1]);
  }
  return null;
}

/** Announcements in a piece of text: "Part 2" starts part 2, "That is the end of Part 1" ends part 1. */
export function announcements(text: string): { part: number; end: boolean }[] {
  return [...text.matchAll(/(end of\s+)?\b(?:part|section)\s+(one|two|three|four|[1-4])\b/gi)].map((m) => ({ part: NUM[m[2].toLowerCase()], end: !!m[1] }));
}

/**
 * Marks from the clips heard after each pause (in time order). A part starts at the first clip announcing it after
 * the previous part; if that announcement was misheard, the clip right after "That is the end of Part n-1" is used.
 */
export function marksFrom(clips: { start: number; text: string }[]): PartMarks {
  const cs = [...clips].sort((a, b) => a.start - b.start);
  const marks: PartMarks = {};
  let after = -Infinity;
  for (let p = 1; p <= 4; p++) {
    let at = cs.find((c) => c.start > after && announcements(c.text).some((a) => a.part === p && !a.end))?.start;
    if (at === undefined && p > 1) {
      const endIdx = cs.findIndex((c) => c.start > after && announcements(c.text).some((a) => a.part === p - 1 && a.end));
      if (endIdx >= 0 && cs[endIdx + 1]) at = cs[endIdx + 1].start;
    }
    if (at === undefined) continue;
    marks[p] = Math.max(0, Math.floor(at - 0.5));
    after = at + 60; // a part lasts minutes: ignore repeats of the same announcement
  }
  return marks;
}

type Asr = (audio: Float32Array, o: Record<string, unknown>) => Promise<{ text: string }>;

/**
 * Where speech starts again after a pause of at least `minGap` seconds (part announcements always follow one).
 * Loudness per 50 ms frame against a threshold taken from the file itself, so quiet and loud recordings both work.
 */
export function speechAfterPauses(pcm: Float32Array, rate = RATE, minGap = 2): number[] {
  const frame = Math.floor(rate * 0.05);
  const rms: number[] = [];
  for (let i = 0; i + frame <= pcm.length; i += frame) {
    let sum = 0;
    for (let k = i; k < i + frame; k++) sum += pcm[k] * pcm[k];
    rms.push(Math.sqrt(sum / frame));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.floor(p * (sorted.length - 1))] ?? 0;
  const thr = Math.max(pct(0.1) * 2, pct(0.5) * 0.15, 1e-4);
  const out = [0];
  let quiet = 0;
  rms.forEach((v, i) => {
    if (v < thr) quiet++;
    else {
      if (quiet * 0.05 >= minGap) out.push(i * 0.05);
      quiet = 0;
    }
  });
  return out;
}

/** Fail instead of waiting forever when a download never answers. */
function withTimeout<T>(p: Promise<T>, ms: number, code: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error(code)), ms))]);
}
/** Like withTimeout, but the clock restarts whenever `lastActivity` moves (a slow download is fine, a stuck one is not). */
function stalled<T>(p: Promise<T>, lastActivity: () => number, ms: number, code: string): Promise<T> {
  return new Promise<T>((ok, no) => {
    const tick = setInterval(() => Date.now() - lastActivity() > ms && (clearInterval(tick), no(new Error(code))), 2000);
    p.then((v) => (clearInterval(tick), ok(v)), (e) => (clearInterval(tick), no(e)));
  });
}

const CLIP = 7; // seconds heard after each pause: "Part 2. You will hear a…" fits easily

export async function findPartMarks(src: Blob | string, onProgress: (msg: string, pct: number) => void): Promise<{ marks: PartMarks; test: number | null }> {
  onProgress("decode", 0);
  const bytes = typeof src === "string" ? await (await fetch(src)).arrayBuffer() : await src.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: RATE });
  const buf = await ctx.decodeAudioData(bytes);
  void ctx.close();
  // one part per file (under 15 minutes): no marks to find; the server hears which part it is when the book is read
  if (buf.duration < 15 * 60) return { marks: {}, test: null };
  const pcm = buf.getChannelData(0); // first channel is enough for speech

  onProgress("lib", 0);
  const lib = await withTimeout(import(/* webpackIgnore: true */ LIB), 90_000, "lib_timeout");
  // model files come through our own server (it downloads them from huggingface.co once and keeps them)
  lib.env.allowLocalModels = false;
  lib.env.remoteHost = `${location.origin}/api/ielts/hf/`;
  const files: Record<string, { loaded: number; total: number }> = {};
  let last = Date.now();
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    last = Date.now();
    if (p.status !== "progress" || !p.file || !p.total) return;
    files[p.file] = { loaded: p.loaded ?? 0, total: p.total };
    const all = Object.values(files);
    onProgress("model", all.reduce((a, f) => a + f.loaded, 0) / all.reduce((a, f) => a + f.total, 0));
  };
  onProgress("model", 0);
  // WASM on purpose: quantised speech models give garbage text on WebGPU in some browsers
  const loading = lib.pipeline("automatic-speech-recognition", MODEL, { device: "wasm", dtype: "q8", progress_callback });
  const asr: Asr = await stalled(loading, () => last, 90_000, "model_timeout");

  // only the few seconds after each pause are transcribed: a full transcription would take many minutes in a browser
  const starts = speechAfterPauses(pcm);
  const heard: { start: number; text: string }[] = [];
  for (const [i, t] of starts.entries()) {
    onProgress("listen", i / starts.length);
    const a = Math.max(0, Math.floor((t - 0.3) * RATE));
    const r = await asr(pcm.subarray(a, Math.min(pcm.length, a + CLIP * RATE)), { max_new_tokens: 32 });
    heard.push({ start: t, text: r.text });
    if (marksFrom(heard)[4] !== undefined) break; // Part 4 found: the rest is not needed
  }
  onProgress("listen", 1);
  console.debug("[part marks] heard after pauses:", heard.map((h) => `${Math.round(h.start)}s ${h.text}`));
  const marks = marksFrom(heard);
  return { marks, test: testNumber(heard, marks[1]) };
}
