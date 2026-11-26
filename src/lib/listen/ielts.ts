/**
 * IELTS Listening part → listening bank, in the worker (server): ffmpeg decodes the part, Whisper (tiny.en, on the CPU)
 * gives a time for every word it hears, those words are matched to the audioscript so the sentences keep the book's
 * words, and the cuts are moved into the nearest pauses.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { CANCELLED, setProgress, type Job } from "@/lib/jobs";
import { UPLOAD_DIR } from "@/lib/storage";
import { saveSource } from "./queries";
import { align, scriptWords, silences, snap, toSentences, type TWord } from "./segment";

const RATE = 16000;
const MODEL = "Xenova/whisper-tiny.en";
const WINDOW = 28; // seconds per Whisper pass (it hears 30 s at most)

/** The part as 16 kHz mono samples. */
export function decode(file: string, start: number, end: number | null): Promise<Float32Array> {
  return new Promise((ok, no) => {
    const args = ["-nostdin", "-v", "error", "-ss", String(start), ...(end ? ["-t", String(Math.max(1, end - start))] : []), "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "pipe:1"];
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
      ok(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4))));
    });
  });
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
let asrLoading: Promise<Asr> | null = null;

/** The speech model, loaded once per worker (downloaded from huggingface.co the first time, then kept on disk). */
function speechModel(): Promise<Asr> {
  asrLoading ??= (async () => {
    const lib = await import("@huggingface/transformers");
    lib.env.cacheDir = path.join(UPLOAD_DIR, "hf-cache");
    return (await lib.pipeline("automatic-speech-recognition", MODEL, { dtype: "q8" })) as unknown as Asr;
  })().catch((e) => {
    asrLoading = null;
    throw e;
  });
  return asrLoading;
}

/** What Whisper hears in `pcm`, with times in seconds from its start. */
export async function hear(pcm: Float32Array, quiet: [number, number][], onStep: (done: number, total: number) => Promise<void>): Promise<TWord[]> {
  const asr = await speechModel();
  const heard: TWord[] = [];
  let wordTimes = true; // a time per word when the model allows it, else per phrase (spread over its words)
  const ws = windows(pcm.length / RATE, quiet);
  for (const [k, [a, b]] of ws.entries()) {
    await onStep(k, ws.length);
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

/** Cut one Listening part into the bank (replaces its sentences if it was cut before). */
export async function cutSection(sectionId: number, onStep: (msg: string) => Promise<void>) {
  const db = getDb();
  const [sec] = await db.select().from(schema.ieltsSections).where(eq(schema.ieltsSections.id, sectionId));
  if (!sec || sec.skill !== "listening" || !sec.audio) throw new Error("no_audio");
  if (!sec.transcript?.trim()) throw new Error("no_transcript");
  const [file] = await db.select({ path: schema.ieltsAudio.path }).from(schema.ieltsAudio).where(eq(schema.ieltsAudio.id, sec.audio.fileId));
  if (!file) throw new Error("no_audio");
  const abs = path.join(UPLOAD_DIR, file.path);
  if (!abs.startsWith(UPLOAD_DIR + path.sep)) throw new Error("no_audio");

  await onStep("decode");
  const from = sec.audio.start ?? 0;
  const pcm = await decode(abs, from, sec.audio.end ?? null);
  const quiet = silences(pcm, RATE);
  const heard = await hear(pcm, quiet, (k, n) => onStep(`listen ${k + 1}/${n}`));
  if (!heard.length) throw new Error("nothing_heard");

  // times in the file (the player plays the whole recording)
  const shift = <T extends { s: number; e: number }>(w: T) => ({ ...w, s: w.s + from, e: w.e + from });
  const clips = snap(
    toSentences(align(scriptWords(sec.transcript), heard.map(shift))),
    quiet.map(([a, b]) => [a + from, b + from] as [number, number]),
  );
  const [test] = await db.select({ title: schema.ieltsTests.title, bookId: schema.ieltsTests.bookId }).from(schema.ieltsTests).where(eq(schema.ieltsTests.id, sec.testId));
  const [book] = test ? await db.select({ title: schema.ieltsBooks.title }).from(schema.ieltsBooks).where(eq(schema.ieltsBooks.id, test.bookId)) : [];
  const id = await saveSource({ kind: "ielts", sectionId: sec.id, title: [book?.title, test?.title, `Listening Part ${sec.part}`].filter(Boolean).join(" · ").slice(0, 255), captions: "script" }, clips);
  return { sourceId: id, sentences: clips.length, heard: heard.length };
}

/** Worker job "listen_cut": the parts one after another; a part that fails does not stop the others. */
export async function cutParts(job: Job) {
  const ids = ((job.payload.sectionIds as number[]) ?? []).filter(Number.isInteger);
  const done: { sectionId: number; sourceId?: number; sentences?: number; error?: string }[] = [];
  for (const [k, sectionId] of ids.entries()) {
    try {
      done.push({ sectionId, ...(await cutSection(sectionId, (msg) => setProgress(job.id, `${k + 1}/${ids.length} · ${msg}`))) });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (error === CANCELLED || error === "ffmpeg_missing") throw e; // stop: cancelled, or nothing can work
      done.push({ sectionId, error });
    }
  }
  if (done.length && done.every((d) => d.error)) throw new Error(done[0].error);
  return { parts: done };
}
