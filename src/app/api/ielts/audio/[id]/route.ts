import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { getAudio, setReceived } from "@/lib/ielts/queries";
import { UPLOAD_DIR } from "@/lib/storage";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
const TYPES: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg" };
const CHUNK = 8 * 1024 * 1024;

const fileOf = (rel: string) => {
  const abs = path.join(UPLOAD_DIR, rel);
  return abs.startsWith(UPLOAD_DIR + path.sep) ? abs : null;
};

/** Append one chunk (raw body, ≤ 8 MB) at ?offset=; the offset must equal what the server already has, so a retry is safe. */
export async function PUT(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const a = id ? await getAudio(id) : undefined;
  const abs = a && fileOf(a.path);
  if (!id || !a || !abs) return bad("not_found", 404);
  const offset = Number(new URL(req.url).searchParams.get("offset"));
  const have = (await fs.stat(abs).catch(() => null))?.size ?? 0;
  if (offset !== have) return NextResponse.json({ error: "offset", received: have }, { status: 409 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length || bytes.length > CHUNK || have + bytes.length > a.size) return bad("invalid");
  await fs.appendFile(abs, bytes);
  await setReceived(id, have + bytes.length);
  return NextResponse.json({ received: have + bytes.length });
}

/** Stream the file with Range support (the player needs it to seek and to start a part in the middle of a file). */
export async function GET(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const a = id ? await getAudio(id) : undefined;
  const abs = a && fileOf(a.path);
  const size = abs ? (await fs.stat(abs).catch(() => null))?.size : undefined;
  if (!a || !abs || !size) return bad("not_found", 404);
  const type = TYPES[path.extname(abs).slice(1)] ?? "application/octet-stream";
  const base = { "content-type": type, "accept-ranges": "bytes", "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" };
  const m = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (!m) return new Response(Readable.toWeb(createReadStream(abs)) as ReadableStream, { headers: { ...base, "content-length": String(size) } });
  let start = m[1] ? Number(m[1]) : size - Number(m[2]);
  let end = m[1] && m[2] ? Number(m[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  return new Response(Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream, {
    status: 206,
    headers: { ...base, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${size}` },
  });
}
