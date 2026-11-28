/**
 * Child process of the web server (dist/tts.js): reads words aloud with Kokoro (an open, local voice model) and saves
 * them as small mp3 files. It keeps the model loaded between requests; the server ends it when it has been idle.
 *   stdin:  one JSON line per job {"id":1,"text":"mitigate","voice":"af_heart","out":"/abs/path.mp3"}
 *   stdout: one JSON line per job {"id":1,"ok":true} or {"id":1,"error":"…"}
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

type Job = { id: number; text: string; voice: string; out: string };
type Tts = { generate: (text: string, o: { voice: string }) => Promise<{ audio: Float32Array; sampling_rate: number }> };

let model: Promise<Tts> | null = null;
async function load(): Promise<Tts> {
  const { env } = await import("@huggingface/transformers");
  // the model is downloaded once and kept with the uploads
  env.cacheDir = path.join(process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads"), "hf-cache");
  const { KokoroTTS } = await import("kokoro-js");
  return (await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" })) as unknown as Tts;
}

/** 32-bit float samples → mono mp3 (48 kbit/s: ~10 KB a word) with ffmpeg. */
function toMp3(samples: Float32Array, rate: number, out: string) {
  return new Promise<void>((ok, no) => {
    const p = spawn("ffmpeg", ["-nostdin", "-v", "error", "-y", "-f", "f32le", "-ar", String(rate), "-ac", "1", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "48k", out]);
    let err = "";
    p.stderr.on("data", (b: Buffer) => (err += b));
    p.on("error", (e: NodeJS.ErrnoException) => no(new Error(e.code === "ENOENT" ? "ffmpeg_missing" : e.message)));
    p.on("close", (code) => (code === 0 ? ok() : no(new Error(`ffmpeg: ${err.trim().slice(0, 200) || code}`))));
    p.stdin.end(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  });
}

async function run(job: Job) {
  model ??= load();
  const tts = await model;
  const { audio, sampling_rate } = await tts.generate(job.text, { voice: job.voice });
  await fs.mkdir(path.dirname(job.out), { recursive: true });
  const tmp = `${job.out}.${process.pid}.tmp.mp3`;
  await toMp3(audio, sampling_rate, tmp);
  await fs.rename(tmp, job.out); // whole files only: a reader never sees half of one
}

// one job at a time: the model is not made for parallel calls, and a word takes under a second
let chain = Promise.resolve();
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let job: Job;
  try {
    job = JSON.parse(line);
  } catch {
    return;
  }
  chain = chain.then(() =>
    run(job).then(
      () => void process.stdout.write(`${JSON.stringify({ id: job.id, ok: true })}\n`),
      (e) => void process.stdout.write(`${JSON.stringify({ id: job.id, error: e instanceof Error ? e.message : String(e) })}\n`),
    ),
  );
});
