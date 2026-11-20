import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { addWordImage } from "@/lib/images";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** multipart "file" → attach an image to a saved word. */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!id || !file || typeof file === "string") return bad("invalid");
  const r = await addWordImage(id, file).catch(() => null);
  return r ? NextResponse.json(r, { status: 201 }) : bad("unsupported_file");
}
