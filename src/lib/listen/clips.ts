/**
 * Sentence clips of IELTS recordings, kept on disk (UPLOAD_DIR/listen-clips/<audio id>/<start>_<end>.aac): a sentence
 * plays at once instead of after the whole recording (tens of MB) has downloaded. Cut when first asked for, and for a
 * whole recording in the worker when its sentences are confirmed in the review editor.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { setProgress, type Job } from "@/lib/jobs";
import { UPLOAD_DIR } from "@/lib/storage";

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

/** Worker job "listen_clips" (payload: { sourceId }): every sentence of an IELTS recording cut ahead. */
export async function cutSourceClips(job: Job) {
  const db = getDb();
  const sourceId = Number(job.payload.sourceId);
  const [src] = await db.select().from(schema.listenSources).where(eq(schema.listenSources.id, sourceId));
  if (!src?.sectionId) return { clips: 0 };
  const [sec] = await db.select({ audio: schema.ieltsSections.audio }).from(schema.ieltsSections).where(eq(schema.ieltsSections.id, src.sectionId));
  const [file] = sec?.audio ? await db.select({ path: schema.ieltsAudio.path }).from(schema.ieltsAudio).where(eq(schema.ieltsAudio.id, sec.audio.fileId)) : [];
  const abs = file && path.join(UPLOAD_DIR, file.path);
  if (!sec?.audio || !abs || !abs.startsWith(UPLOAD_DIR + path.sep)) return { clips: 0 };
  const rows = await db.select({ start: schema.listenItems.start, end: schema.listenItems.end }).from(schema.listenItems).where(and(eq(schema.listenItems.sourceId, sourceId), eq(schema.listenItems.hidden, false)));
  let failed = 0;
  for (const [k, r] of rows.entries()) {
    if (k % 10 === 0) await setProgress(job.id, `${k}/${rows.length}`);
    if (!(await cutClip(sec.audio.fileId, abs, Math.max(0, r.start + src.shift), r.end + src.shift, true))) failed++;
  }
  if (failed === rows.length && rows.length) throw new Error("ffmpeg_failed");
  return { clips: rows.length - failed, failed };
}
