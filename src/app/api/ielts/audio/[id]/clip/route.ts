import { spawn } from "node:child_process";
import path from "node:path";
import { bad, idParam } from "@/lib/api";
import { getAudio } from "@/lib/ielts/queries";
import { UPLOAD_DIR } from "@/lib/storage";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/**
 * One stretch of a recording (?s=12.3&e=17.8, at most 2 minutes) as a small AAC file, so a dictation sentence plays
 * at once instead of after the whole recording (tens of MB) has downloaded. The same URL is the same bytes: cached.
 * Channels stay as they are: joining them would silence recordings with one channel inverted (Cambridge IELTS 3).
 */
export async function GET(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const q = new URL(req.url).searchParams;
  const s = Number(q.get("s"));
  const e = Number(q.get("e"));
  if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s || e - s > 120) return bad("invalid");
  const a = id ? await getAudio(id) : undefined;
  const abs = a && path.join(UPLOAD_DIR, a.path);
  if (!abs || !abs.startsWith(UPLOAD_DIR + path.sep)) return bad("not_found", 404);

  const bytes = await new Promise<Buffer | null>((ok) => {
    const p = spawn("ffmpeg", ["-nostdin", "-v", "error", "-ss", String(s), "-t", String(e - s), "-i", abs, "-vn", "-c:a", "aac", "-b:a", "96k", "-f", "adts", "pipe:1"]);
    const out: Buffer[] = [];
    p.stdout.on("data", (b: Buffer) => out.push(b));
    p.on("error", () => ok(null));
    p.on("close", (code) => ok(code === 0 ? Buffer.concat(out) : null));
  });
  if (!bytes?.length) return bad("clip_failed", 500);
  return new Response(new Uint8Array(bytes), { headers: { "content-type": "audio/aac", "content-length": String(bytes.length), "cache-control": "private, max-age=604800" } });
}
