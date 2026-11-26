/**
 * IELTS Listening part → listening bank, in the worker. The speech recognition runs in a child process
 * (dist/speech.js, low CPU priority, one thread) that gives its memory back when it ends; here its words are matched
 * to the audioscript, so the sentences keep the book's words, and the cuts are moved into the nearest pauses.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { CANCELLED, setProgress, type Job } from "@/lib/jobs";
import { UPLOAD_DIR } from "@/lib/storage";
import { queueClips } from "./clips";
import { saveSource } from "./queries";
import { align, scriptWords, snap, toSentences, type TWord } from "./segment";

/** Hear a stretch of a recording in dist/speech.js; `onStep` gets its "decode" / "3/15" steps. */
export function runSpeech(file: string, start: number, end: number | null, onStep: (step: string) => Promise<void>): Promise<{ heard: TWord[]; quiet: [number, number][] }> {
  return new Promise((ok, no) => {
    const script = path.join(process.cwd(), "dist", "speech.js");
    const args = [script, file, String(start), end ? String(end) : ""];
    // lowest CPU priority: the website always comes first
    const p = process.platform === "win32" ? spawn(process.execPath, args) : spawn("nice", ["-n", "19", process.execPath, ...args]);
    let out = "";
    let err = "";
    let last: Promise<void> = Promise.resolve();
    let stopped: unknown = null; // onStep threw (job cancelled): stop the child, report this

    p.stdout.on("data", (b: Buffer) => (out += b));
    p.stderr.on("data", (b: Buffer) => {
      for (const line of String(b).split("\n")) {
        const step = line.match(/^step (.+)$/)?.[1];
        if (step)
          last = last
            .then(() => (stopped ? undefined : onStep(step)))
            .catch((e) => {
              stopped ??= e;
              p.kill();
            });
        else if (line.startsWith("error ")) err = line.slice(6);
      }
    });
    p.on("error", (e) => no(e));
    p.on("close", async (code, signal) => {
      await last;
      if (stopped) return no(stopped); // a cancelled job stops here
      // judged by its output, not its exit code: onnxruntime may abort while the process shuts down after writing it
      if (out.trim()) {
        try {
          const r = JSON.parse(out);
          if (Array.isArray(r.heard) && Array.isArray(r.quiet)) return ok(r);
        } catch {}
        return no(new Error("speech_bad_output"));
      }
      // killed from outside (most often: the server ran out of memory)
      no(new Error(err || (signal === "SIGKILL" ? "out_of_memory" : `speech_failed ${signal ?? code}`)));
    });
  });
}

type Section = typeof schema.ieltsSections.$inferSelect;

/** What Whisper heard in a part's stretch of the recording (times in the file); heard once per stretch, then kept. */
async function hearSection(sec: Section, onStep: (msg: string) => Promise<void>) {
  const db = getDb();
  if (!sec.audio) throw new Error("no_audio");
  const [file] = await db.select({ path: schema.ieltsAudio.path }).from(schema.ieltsAudio).where(eq(schema.ieltsAudio.id, sec.audio.fileId));
  if (!file) throw new Error("no_audio");
  const abs = path.join(UPLOAD_DIR, file.path);
  if (!abs.startsWith(UPLOAD_DIR + path.sep)) throw new Error("no_audio");
  const from = sec.audio.start ?? 0;
  const to = sec.audio.end ?? null;
  const [kept] = await db.select().from(schema.listenSpeech).where(eq(schema.listenSpeech.sectionId, sec.id));
  if (kept && kept.fileId === sec.audio.fileId && kept.start === from && (kept.end ?? null) === to && kept.heard.length) return kept;
  const r = await runSpeech(abs, from, to, (s) => onStep(s === "decode" ? "decode" : `listen ${s}`));
  const heard = r.heard.map((w) => ({ w: w.w, s: w.s + from, e: w.e + from }));
  const quiet = r.quiet.map(([a, b]) => [a + from, b + from] as [number, number]);
  if (!heard.length) throw new Error("nothing_heard");
  const row = { fileId: sec.audio.fileId, start: from, end: to, heard, quiet };
  await db.insert(schema.listenSpeech).values({ sectionId: sec.id, ...row }).onDuplicateKeyUpdate({ set: row });
  return row;
}

/** Cut one Listening part into the bank (replaces its sentences if it was cut before). */
export async function cutSection(sectionId: number, onStep: (msg: string) => Promise<void>) {
  const db = getDb();
  const [sec] = await db.select().from(schema.ieltsSections).where(eq(schema.ieltsSections.id, sectionId));
  if (!sec || sec.skill !== "listening" || !sec.audio) throw new Error("no_audio");
  if (!sec.transcript?.trim()) throw new Error("no_transcript");
  const { heard, quiet } = await hearSection(sec, onStep);

  const clips = snap(toSentences(align(scriptWords(sec.transcript), heard)), quiet);
  const [test] = await db.select({ title: schema.ieltsTests.title, bookId: schema.ieltsTests.bookId }).from(schema.ieltsTests).where(eq(schema.ieltsTests.id, sec.testId));
  const [book] = test ? await db.select({ title: schema.ieltsBooks.title }).from(schema.ieltsBooks).where(eq(schema.ieltsBooks.id, test.bookId)) : [];
  const id = await saveSource({ kind: "ielts", sectionId: sec.id, title: [book?.title, test?.title, `Listening Part ${sec.part}`].filter(Boolean).join(" · ").slice(0, 255), captions: "script" }, clips);
  await queueClips(sec.audio!.fileId); // the old sentences' clips go, the new ones are cut ahead
  return { sourceId: id, sentences: clips.length, heard: heard.length };
}

type Payload = { sectionIds?: number[]; total?: number; parts?: { sectionId: number; sourceId?: number; sentences?: number; error?: string }[] };

/**
 * Worker job "listen_cut": the parts one after another; a part that fails does not stop the others. Each part done is
 * taken off the job, so a job run again (worker restarted) goes on from the next part instead of the first.
 */
export async function cutParts(job: Job) {
  const p = job.payload as Payload;
  const todo = (p.sectionIds ?? []).filter(Number.isInteger);
  const total = p.total ?? todo.length;
  const done = [...(p.parts ?? [])];
  while (todo.length) {
    const sectionId = todo[0];
    const k = total - todo.length + 1;
    try {
      done.push({ sectionId, ...(await cutSection(sectionId, (msg) => setProgress(job.id, `${k}/${total} · ${msg}`))) });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (error === CANCELLED || error === "ffmpeg_missing") throw e; // stop: cancelled, or nothing can work
      done.push({ sectionId, error });
    }
    todo.shift();
    await getDb().update(schema.jobs).set({ payload: { sectionIds: todo, total, parts: done } }).where(eq(schema.jobs.id, job.id));
  }
  if (done.length && done.every((d) => d.error)) throw new Error(done[0].error);
  return { parts: done };
}

/**
 * Worker job "ielts_transcribe" (payload: { sectionId }): a transcript for a part whose book prints none, from what
 * Whisper hears, one sentence a line. It is the job's result; the review screen puts it in the editor to check.
 */
export async function transcribeSection(job: Job) {
  const db = getDb();
  const [sec] = await db.select().from(schema.ieltsSections).where(eq(schema.ieltsSections.id, Number(job.payload.sectionId)));
  if (!sec || sec.skill !== "listening" || !sec.audio) throw new Error("no_audio");
  const { heard } = await hearSection(sec, (msg) => setProgress(job.id, msg));
  const text = heard
    .map((w) => w.w)
    .join(" ")
    .replace(/([.!?])\s+(?=[A-Z0-9"“])/g, "$1\n")
    .trim();
  return { text };
}
