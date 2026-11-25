import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { createAudio, getBook } from "@/lib/ielts/queries";
import { saveUpload } from "@/lib/storage";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
const MAX_AUDIO = 400 * 1024 * 1024;

/** Start an audio upload: { name, size } → { id }; the bytes follow in chunks (PUT /api/ielts/audio/<id>?offset=…). */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getBook(id))) return bad("not_found", 404);
  const [data, err] = await parseBody(req, z.object({ name: z.string().trim().min(1).max(255), size: z.number().int().min(1).max(MAX_AUDIO) }));
  if (err) return err;
  const ext = data.name.match(/\.(mp3|m4a|wav|ogg)$/i)?.[1].toLowerCase();
  if (!ext) return bad("unsupported_file");
  const path = await saveUpload(new Uint8Array(0), "ielts-audio", ext);
  return NextResponse.json({ id: await createAudio(id, data.name, data.size, path) }, { status: 201 });
}
