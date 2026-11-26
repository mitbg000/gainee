/**
 * Sentence clips of IELTS recordings, kept on disk (UPLOAD_DIR/listen-clips/<audio id>/<start>_<end>.aac): a sentence
 * plays at once instead of after the whole recording (tens of MB) has downloaded. Cut when first asked for, and for a
 * whole recording in the worker when its sentences are confirmed in the review editor or a source is deleted; that
 * job also removes the clips nothing plays any more.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { enqueue, setProgress, type Job } from "@/lib/jobs";
import { UPLOAD_DIR } from "@/lib/storage";
import { toChunks } from "./segment";

export const clipDir = (audioId: number) => path.join(UPLOAD_DIR, "listen-clips", String(audioId));
// the same rounding as the player's URL (useClipPlayer), so both name the same file
const key = (x: number) => (Math.round(x * 100) / 100).toFixed(2);

/**
 * The clip's file, cut first if it is not there yet. Channels stay as they are: joining them would silence recordings
 * with one channel inverted (Cambridge IELTS 3). Null when ffmpeg failed.
 */
export async function cutClip(audioId: number, audioFile: string, s: number, e: number, low = false): Promise<string | null> {
  const out = path.join(clipDir(audioId), `${key(s)}_${key(e)}.aac`);
  if (await fs.stat(out).then((x) => x.size > 0, () => false)) return out;
  await fs.mkdir(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.${Date.now()}.tmp`;
  const args = ["-nostdin", "-v", "error", "-y", "-ss", key(s), "-t", String(Number(key(e)) - Number(key(s))), "-i", audioFile, "-vn", "-c:a", "aac", "-b:a", "96k", "-f", "adts", tmp];
  const ok = await new Promise<boolean>((done) => {
    const p = low && process.platform !== "win32" ? spawn("nice", ["-n", "19", "ffmpeg", ...args]) : spawn("ffmpeg", args);
    p.on("error", () => done(false));
    p.on("close", (code) => done(code === 0));
  });
  if (!ok) {
    await fs.rm(tmp, { force: true });
    return null;
  }
  await fs.rename(tmp, out); // whole or not at all: a request at the same moment never reads half a file
  return out;
}

/** The recording an IELTS source plays (null for YouTube or a part without audio). */
export async function audioOfSource(sourceId: number): Promise<number | null> {
  const db = getDb();
  const [r] = await db
    .select({ audio: schema.ieltsSections.audio })
    .from(schema.listenSources)
    .innerJoin(schema.ieltsSections, eq(schema.listenSources.sectionId, schema.ieltsSections.id))
    .where(eq(schema.listenSources.id, sourceId));
  return r?.audio?.fileId ?? null;
}

/** Queue "listen_clips" for a recording, once while one is waiting. */
export async function queueClips(audioId: number | null) {
  if (!audioId) return;
  const waiting = await getDb().select({ payload: schema.jobs.payload }).from(schema.jobs).where(and(eq(schema.jobs.type, "listen_clips"), eq(schema.jobs.status, "queued")));
  if (!waiting.some((j) => j.payload.audioId === audioId)) await enqueue("listen_clips", { audioId });
}

/**
 * Worker job "listen_clips" (payload: { audioId }): the clips of every IELTS source playing this recording are cut
 * ahead (sentences, and the chunks of "listen only"), and the files no sentence uses any more (times changed, sentences
 * joined or removed, source deleted) are removed.
 */
export async function cutAudioClips(job: Job) {
  const db = getDb();
  const audioId = Number(job.payload.audioId ?? (job.payload.sourceId ? await audioOfSource(Number(job.payload.sourceId)) : 0));
  const [file] = audioId ? await db.select({ path: schema.ieltsAudio.path }).from(schema.ieltsAudio).where(eq(schema.ieltsAudio.id, audioId)) : [];
  const abs = file && path.join(UPLOAD_DIR, file.path);
  if (!abs || !abs.startsWith(UPLOAD_DIR + path.sep)) return { clips: 0 };

  // every source on this recording (one file can hold all four parts of a test)
  const sources = (
    await db
      .select({ id: schema.listenSources.id, shift: schema.listenSources.shift, audio: schema.ieltsSections.audio })
      .from(schema.listenSources)
      .innerJoin(schema.ieltsSections, eq(schema.listenSources.sectionId, schema.ieltsSections.id))
  ).filter((x) => x.audio?.fileId === audioId);
  const ranges: [number, number][] = [];
  for (const src of sources) {
    const rows = await db
      .select({ start: schema.listenItems.start, end: schema.listenItems.end, speaker: schema.listenItems.speaker })
      .from(schema.listenItems)
      .where(and(eq(schema.listenItems.sourceId, src.id), eq(schema.listenItems.hidden, false)))
      .orderBy(asc(schema.listenItems.idx));
    // as the player asks for them: a sentence, or a chunk of sentences (ListenChunks), moved by the source's shift
    const at = (a: number, b: number): [number, number] => [Math.max(0, a + src.shift), b + src.shift];
    for (const r of rows) ranges.push(at(r.start, r.end));
    for (const c of toChunks(rows)) ranges.push(at(c[0].start, c[c.length - 1].end));
  }

  const keep = new Set<string>();
  let failed = 0;
  for (const [k, [a, b]] of ranges.entries()) {
    if (k % 10 === 0) await setProgress(job.id, `${k}/${ranges.length}`);
    const out = await cutClip(audioId, abs, a, b, true);
    if (out) keep.add(path.basename(out));
    else failed++;
  }
  if (failed && failed === ranges.length) throw new Error("ffmpeg_failed");

  // the rest goes; a .tmp younger than an hour may be a request cutting right now
  let removed = 0;
  const dir = clipDir(audioId);
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    if (keep.has(name)) continue;
    const full = path.join(dir, name);
    if (name.endsWith(".tmp") && Date.now() - (await fs.stat(full).then((x) => x.mtimeMs, () => 0)) < 3_600_000) continue;
    await fs.rm(full, { force: true });
    removed++;
  }
  return { clips: keep.size, failed, removed };
}
