import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { MAX_IMAGE_BYTES, saveImage, sniff } from "@/lib/images";

export const runtime = "nodejs";
/** multipart "file" → { url } (served by /api/images/...). */
export async function POST(req: Request) {
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!file || typeof file === "string") return bad("invalid");
  if (file.size > MAX_IMAGE_BYTES) return bad("file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniff(bytes);
  if (!ext) return bad("unsupported_file");
  const { path } = await saveImage(bytes, ext);
  return NextResponse.json({ url: `/api/${path}` }, { status: 201 });
}
