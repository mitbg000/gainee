import fs from "node:fs/promises";
import path from "node:path";
import { bad, idParam } from "@/lib/api";
import { getAudio } from "@/lib/ielts/queries";
import { cutClip } from "@/lib/listen/clips";
import { UPLOAD_DIR } from "@/lib/storage";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** One stretch of a recording (?s=12.3&e=17.8, at most 2 minutes) as a small AAC file (see lib/listen/clips). */
export async function GET(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const q = new URL(req.url).searchParams;
  const s = Number(q.get("s"));
  const e = Number(q.get("e"));
  if (!id || !Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s || e - s > 120) return bad("invalid");
  const a = await getAudio(id);
  const abs = a && path.join(UPLOAD_DIR, a.path);
  if (!abs || !abs.startsWith(UPLOAD_DIR + path.sep)) return bad("not_found", 404);
  const file = await cutClip(id, abs, s, e);
  const bytes = file ? await fs.readFile(file).catch(() => null) : null;
  if (!bytes?.length) return bad("clip_failed", 500);
  return new Response(new Uint8Array(bytes), { headers: { "content-type": "audio/aac", "content-length": String(bytes.length), "cache-control": "private, max-age=604800" } });
}
