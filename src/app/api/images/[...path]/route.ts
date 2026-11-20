import fs from "node:fs/promises";
import path from "node:path";
import { bad } from "@/lib/api";
import { UPLOAD_DIR } from "@/lib/storage";

export const runtime = "nodejs";
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const abs = path.join(UPLOAD_DIR, "images", ...parts);
  const type = TYPES[path.extname(abs).slice(1).toLowerCase()];
  if (!type || !abs.startsWith(path.join(UPLOAD_DIR, "images") + path.sep)) return bad("not_found", 404);
  const buf = await fs.readFile(abs).catch(() => null);
  if (!buf) return bad("not_found", 404);
  return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
}
