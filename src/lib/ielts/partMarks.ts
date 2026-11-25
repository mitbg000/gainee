/**
 * Find where each Listening part starts in one recording of a whole test, in the browser:
 * Whisper (tiny English model, ~40 MB, cached by the browser after the first time) hears the few seconds after each
 * long pause and we look for the announcements "Part 2" / "Now turn to Section 2". Free, no server work.
 */
export type PartMarks = Record<string, number>; // part → second where its announcement starts

const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
const MODEL = "Xenova/whisper-tiny.en";
const RATE = 16000;

const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, "1": 1, "2": 2, "3": 3, "4": 4 };

/** "...That is the end of Part 1. ... Now turn to Part 2." → part numbers announced as a start, with the text before them. */
export function announcedParts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(end of\s+)?\b(?:part|section)\s+(one|two|three|four|[1-4])\b/gi)) if (!m[1]) out.push(NUM[m[2].toLowerCase()]);
  return out;
}

/** Marks from timed transcript pieces: the first announcement of part n after part n-1, in order. */
export function marksFrom(chunks: { start: number; text: string }[]): PartMarks {
  const marks: PartMarks = {};
  let next = 1;
  for (const c of [...chunks].sort((a, b) => a.start - b.start)) {
    for (const p of announcedParts(c.text)) {
      if (p === next && (next === 1 || c.start > marks[next - 1] + 60)) {
        marks[p] = Math.max(0, Math.floor(c.start - 0.5));
        next++;
      }
    }
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

const CLIP = 7; // seconds heard after each pause: "Part 2. You will hear a…" fits easily

export async function findPartMarks(src: Blob | string, onProgress: (msg: string, pct: number) => void): Promise<PartMarks> {
  onProgress("model", 0);
  const lib = await import(/* webpackIgnore: true */ LIB);
  // WASM on purpose: the quantised model gives garbage text on WebGPU in some browsers
  const asr: Asr = await lib.pipeline("automatic-speech-recognition", MODEL, { device: "wasm", dtype: "q8" });

  onProgress("decode", 0);
  const bytes = typeof src === "string" ? await (await fetch(src)).arrayBuffer() : await src.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: RATE });
  const buf = await ctx.decodeAudioData(bytes);
  void ctx.close();
  const pcm = buf.getChannelData(0); // first channel is enough for speech

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
  return marksFrom(heard);
}
