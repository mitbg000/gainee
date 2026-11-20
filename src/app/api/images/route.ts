import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { saveUpload } from "@/lib/storage";

export const runtime = "nodejs";
const MAX = 8 * 1024 * 1024;

/** Detect the image type from its first bytes (never trust the client's content type). SVG is refused on purpose. */
function sniff(b: Uint8Array): "png" | "jpg" | "gif" | "webp" | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

/** multipart "file" → { url } (served by /api/images/...). */
export async function POST(req: Request) {
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!file || typeof file === "string") return bad("invalid");
  if (file.size > MAX) return bad("file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniff(bytes);
  if (!ext) return bad("unsupported_file");
  const rel = await saveUpload(bytes, "images", ext);
  return NextResponse.json({ url: `/api/${rel}` }, { status: 201 });
}
