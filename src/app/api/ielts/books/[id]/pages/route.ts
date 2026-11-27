import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { sniff } from "@/lib/images";
import { getBook, savePage } from "@/lib/ielts/queries";
import { saveUpload } from "@/lib/storage";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/**
 * A few pages at a time (multipart): "page" (repeated page numbers), "text_<n>" (text layer, may be empty for scans),
 * "img_<n>" (page picture rendered in the browser) and "source_<n>" (name of its PDF file). Kept small so each request stays well under proxy limits.
 */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const book = id ? await getBook(id) : undefined;
  if (!id || !book) return bad("not_found", 404);
  const form = await req.formData().catch(() => null);
  if (!form) return bad("invalid");
  const nums = form.getAll("page").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= book.pageCount);
  if (!nums.length || nums.length > 10) return bad("invalid");
  for (const n of nums) {
    const text = String(form.get(`text_${n}`) ?? "").slice(0, 60000);
    const img = form.get(`img_${n}`);
    let path: string | null = null;
    if (img && typeof img !== "string" && img.size <= 4 * 1024 * 1024) {
      const bytes = new Uint8Array(await img.arrayBuffer());
      const ext = sniff(bytes);
      if (ext && ext !== "gif") path = await saveUpload(bytes, "images/ielts", ext);
    }
    const source = String(form.get(`source_${n}`) ?? "").trim().slice(0, 255) || null;
    await savePage(id, n, text, path, source);
  }
  return NextResponse.json({ ok: true });
}
