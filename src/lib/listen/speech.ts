/**
 * Speech recognition for the listening bank: ffmpeg decodes a stretch of a recording, Whisper (tiny.en, CPU) gives a
 * time for every word. Runs only in its own process (src/worker/speech.ts): it needs ~1 GB of memory while working,
 * which is given back when that process ends.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/storage";
import type { TWord } from "./segment";

export const RATE = 16000;
const MODEL = "Xenova/whisper-tiny.en";
const WINDOW = 28; // seconds per Whisper pass (it hears 30 s at most)
/** CPU threads for Whisper and ffmpeg: 1 leaves the other cores to the website */
const THREADS = Math.max(1, Number(process.env.SPEECH_THREADS) || 1);

/**
 * A stretch of the recording as 16 kHz mono samples. Decoded as two channels and joined here: some recordings (Cambridge
 * IELTS 3) have one channel turned upside down, so the usual L+R cancels the voices out; L−R is taken when it is louder.
 */
export function decode(file: string, start: number, end: number | null): Promise<Float32Array> {
  return new Promise((ok, no) => {
    const args = ["-nostdin", "-v", "error", "-threads", String(THREADS), "-ss", String(start), ...(end ? ["-t", String(Math.max(1, end - start))] : []), "-i", file, "-ac", "2", "-ar", String(RATE), "-f", "f32le", "pipe:1"];
    const p = spawn("ffmpeg", args);
    const chunks: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (b: Buffer) => chunks.push(b));
    p.stderr.on("data", (b: Buffer) => (err += b));
    p.on("error", (e: NodeJS.ErrnoException) => no(new Error(e.code === "ENOENT" ? "ffmpeg_missing" : e.message)));
    p.on("close", (code) => {
      if (code !== 0) return no(new Error(`ffmpeg: ${err.trim().slice(0, 300) || code}`));
      const buf = Buffer.concat(chunks);
      // copy into an aligned buffer: Float32Array needs a 4-byte aligned offset
      ok(toMono(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 8)))));
    });
  });
}

/** Interleaved stereo → mono: (L+R)/2, or (L−R)/2 when that is louder (one channel's phase inverted). */
export function toMono(lr: Float32Array): Float32Array {
  let sum = 0;
  let diff = 0;
  for (let i = 0; i + 1 < lr.length; i += 2) {
    sum += (lr[i] + lr[i + 1]) ** 2;
    diff += (lr[i] - lr[i + 1]) ** 2;
  }
  const sign = diff > sum ? -1 : 1;
  const out = new Float32Array(lr.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = (lr[2 * i] + sign * lr[2 * i + 1]) / 2;
  return out;
}

/** Windows of at most WINDOW seconds that end in a pause, so no word is cut in two. */
export function windows(len: number, quiet: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let from = 0; from < len - 0.5; ) {
    const limit = Math.min(len, from + WINDOW);
    const q = limit >= len ? null : quiet.filter(([a, b]) => (a + b) / 2 > from + 10 && (a + b) / 2 <= limit).at(-1);
    const to = q ? (q[0] + q[1]) / 2 : limit;
    out.push([from, to]);
    from = to;
  }
  return out;
}

type Chunk = { text: string; timestamp: [number, number | null] };
type Asr = (pcm: Float32Array, o: Record<string, unknown>) => Promise<{ text: string; chunks?: Chunk[] }>;

/** The speech model (downloaded from huggingface.co the first time, then kept in UPLOAD_DIR/hf-cache). */
async function speechModel(): Promise<Asr> {
  const lib = await import("@huggingface/transformers");
  lib.env.cacheDir = path.join(UPLOAD_DIR, "hf-cache");
  return (await lib.pipeline("automatic-speech-recognition", MODEL, {
    dtype: "q8",
    session_options: { intraOpNumThreads: THREADS, interOpNumThreads: 1 },
  } as Parameters<typeof lib.pipeline>[2])) as unknown as Asr;
}

/** What Whisper hears in `pcm`, with times in seconds from its start. */
export async function hear(pcm: Float32Array, quiet: [number, number][], onStep: (done: number, total: number) => void): Promise<TWord[]> {
  const asr = await speechModel();
  const heard: TWord[] = [];
  let wordTimes = true; // a time per word when the model allows it, else per phrase (spread over its words)
  const ws = windows(pcm.length / RATE, quiet);
  for (const [k, [a, b]] of ws.entries()) {
    onStep(k, ws.length);
    const piece = pcm.subarray(Math.floor(a * RATE), Math.floor(b * RATE));
    let out;
    try {
      out = await asr(piece, { return_timestamps: wordTimes ? "word" : true });
    } catch (e) {
      if (!wordTimes) throw e;
      wordTimes = false;
      out = await asr(piece, { return_timestamps: true });
    }
    for (const c of out.chunks ?? []) {
      const s = c.timestamp[0] + a;
      const e = (c.timestamp[1] ?? b - a) + a;
      const parts = c.text.trim().split(/\s+/).filter(Boolean);
      parts.forEach((w, q) => heard.push({ w, s: s + ((e - s) * q) / parts.length, e: s + ((e - s) * (q + 1)) / parts.length }));
    }
  }
  return heard;
}
