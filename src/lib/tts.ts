/**
 * Words read aloud on the server (Kokoro, in the child process dist/tts.js), saved once as mp3 and shared by everyone:
 * uploads/tts/<voice>/<sha1 of the text>.mp3. Phones play a file, which is far steadier on iPhone than the browser's
 * own speech. The child keeps its model loaded and is ended after IDLE_MS without work.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { UPLOAD_DIR } from "@/lib/storage";

export const VOICES = { female: "af_heart", male: "am_michael" } as const;
export type Voice = keyof typeof VOICES;
export const MAX_TEXT = 300;
const IDLE_MS = 10 * 60_000;
const JOB_MS = 60_000; // the first job also loads (or downloads) the model

/** The text as it is read and stored: spaces tidied, at most MAX_TEXT characters. */
export const cleanText = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);

export function audioPath(text: string, voice: Voice) {
  const hash = createHash("sha1").update(cleanText(text)).digest("hex");
  return path.join(UPLOAD_DIR, "tts", voice, hash.slice(0, 2), `${hash}.mp3`);
}

let child: ChildProcessWithoutNullStreams | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;
const waiting = new Map<number, { ok: () => void; no: (e: Error) => void }>();
const making = new Map<string, Promise<string>>(); // the same file asked for twice at once is made once

function stop() {
  child?.kill();
  child = null;
}
function start() {
  const script = path.join(process.cwd(), "dist", "tts.js");
  // lowest CPU priority: pages come first
  const env = { ...process.env, UPLOAD_DIR };
  const p = process.platform === "win32" ? spawn(process.execPath, [script], { env }) : spawn("nice", ["-n", "10", process.execPath, script], { env });
  p.on("exit", () => {
    if (child === p) child = null;
    for (const w of waiting.values()) w.no(new Error("tts_stopped"));
    waiting.clear();
  });
  p.stderr.on("data", () => {}); // model download progress and warnings
  readline.createInterface({ input: p.stdout }).on("line", (line) => {
    try {
      const r = JSON.parse(line) as { id: number; ok?: boolean; error?: string };
      const w = waiting.get(r.id);
      waiting.delete(r.id);
      if (r.ok) w?.ok();
      else w?.no(new Error(r.error ?? "tts_failed"));
    } catch {}
  });
  return (child = p);
}

function make(text: string, voice: Voice, out: string) {
  const p = child ?? start();
  clearTimeout(idle);
  const id = nextId++;
  return new Promise<void>((ok, no) => {
    const timer = setTimeout(() => (waiting.delete(id), no(new Error("tts_timeout"))), JOB_MS);
    waiting.set(id, { ok: () => (clearTimeout(timer), ok()), no: (e) => (clearTimeout(timer), no(e)) });
    p.stdin.write(`${JSON.stringify({ id, text, voice: VOICES[voice], out })}\n`);
  }).finally(() => {
    clearTimeout(idle);
    idle = setTimeout(stop, IDLE_MS);
  });
}

/** The mp3 of `text` in `voice`: made now if it is not there yet. Returns its path. */
export async function ensureAudio(text: string, voice: Voice) {
  const clean = cleanText(text);
  if (!clean) throw new Error("empty");
  const out = audioPath(clean, voice);
  if (await fs.stat(out).then(() => true, () => false)) return out;
  const key = `${voice}:${out}`;
  let job = making.get(key);
  if (!job) {
    job = make(clean, voice, out).then(() => out);
    making.set(key, job);
    void job.finally(() => making.delete(key)).catch(() => {});
  }
  return job;
}

/** Make a saved word's audio ahead (both voices), so it plays at once when it is studied. Errors are ignored. */
export function warmAudio(text: string) {
  for (const v of Object.keys(VOICES) as Voice[]) void ensureAudio(text, v).catch(() => {});
}
