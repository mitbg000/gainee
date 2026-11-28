import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { bad } from "@/lib/api";
import { cleanText, ensureAudio, VOICES, type Voice } from "@/lib/tts";

export const runtime = "nodejs";

/** ?t=text&v=female|male → an mp3 of the text read aloud (made on first request, then kept for everyone). */
export async function GET(req: NextRequest) {
  const text = cleanText(req.nextUrl.searchParams.get("t") ?? "");
  const v = req.nextUrl.searchParams.get("v") ?? "female";
  if (!text || !(v in VOICES)) return bad("invalid");
  let file: string;
  try {
    file = await ensureAudio(text, v as Voice);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "tts_failed", 503);
  }
  const { size } = await fs.stat(file);
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    // the same text and voice always give the same file: browsers and the proxy may keep it
    headers: { "content-type": "audio/mpeg", "content-length": String(size), "cache-control": "public, max-age=31536000, immutable", "accept-ranges": "none" },
  });
}
