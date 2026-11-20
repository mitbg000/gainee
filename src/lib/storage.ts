/** Files on disk under UPLOAD_DIR (kept outside the app folder so deploys never touch them). */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads"));

/** Save bytes as <UPLOAD_DIR>/<folder>/<YYYY>/<MM>/<uuid>.<ext>; returns the path relative to UPLOAD_DIR. */
export async function saveUpload(bytes: Uint8Array, folder: string, ext: string): Promise<string> {
  const now = new Date();
  const rel = path.posix.join(folder, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"), `${crypto.randomUUID()}.${ext.replace(/[^a-z0-9]/gi, "")}`);
  const abs = path.join(UPLOAD_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
  return rel;
}

export async function removeUpload(rel: string | null | undefined) {
  if (!rel) return;
  const abs = path.join(UPLOAD_DIR, rel);
  if (!abs.startsWith(UPLOAD_DIR + path.sep)) return;
  await fs.rm(abs, { force: true });
}
