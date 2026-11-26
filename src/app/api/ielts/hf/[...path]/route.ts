import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { bad } from "@/lib/api";
import { UPLOAD_DIR } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;
type Ctx = { params: Promise<{ path: string[] }> };

// Only the speech models used here (part marks, timing listening sentences): this is not an open proxy.
const ALLOWED = /^(onnx-community\/moonshine-tiny-ONNX|Xenova\/whisper-tiny\.en)\/resolve\/main\/[\w.-]+(\/[\w.-]+)?$/;
const CACHE = path.join(UPLOAD_DIR, "hf");

/**
 * Same-origin copy of the speech model files for the browser: downloaded from huggingface.co once, then served
 * from disk. Browsers that cannot reach huggingface.co directly (slow or blocked networks) still get the model.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const rel = (await params).path.join("/");
  if (!ALLOWED.test(rel) || rel.includes("..")) return bad("not_found", 404);
  const file = path.join(CACHE, rel);
  const type = file.endsWith(".json") ? "application/json" : "application/octet-stream";
  const stat = await fs.stat(file).catch(() => null);
  if (!stat) {
    const up = await fetch(`https://huggingface.co/${rel}`, { signal: AbortSignal.timeout(280_000) }).catch(() => null);
    if (!up) return bad("upstream_unreachable", 502);
    if (!up.ok || !up.body) return bad("not_found", up.status === 404 ? 404 : 502);
    // stream to the browser while saving a copy (so the first download shows progress too)
    const [toClient, toDisk] = up.body.tee();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFile(tmp, Readable.fromWeb(toDisk as import("node:stream/web").ReadableStream))
      .then(() => fs.rename(tmp, file))
      .catch(() => fs.rm(tmp, { force: true }));
    const len = up.headers.get("content-length");
    return new Response(toClient, { headers: { "content-type": type, ...(len ? { "content-length": len } : {}), "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: { "content-type": type, "content-length": String(stat.size), "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
