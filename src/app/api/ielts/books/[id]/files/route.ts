import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { addPageRoom, getBook, removePdfPages } from "@/lib/ielts/queries";
import { removeUpload } from "@/lib/storage";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
const MAX_PAGES = 600;

/** One more PDF for the book: { pages } → { from }, the number of its first page; the pages follow (POST …/pages). */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const book = id ? await getBook(id) : undefined;
  if (!id || !book) return bad("not_found", 404);
  const [d, err] = await parseBody(req, z.object({ pages: z.number().int().min(1).max(MAX_PAGES) }));
  if (err) return err;
  if (book.pageCount + d.pages > MAX_PAGES) return bad("too_many_pages");
  return NextResponse.json({ from: await addPageRoom(id, d.pages) }, { status: 201 });
}

/** Take one PDF's pages out of the book: { name } ("" = pages uploaded before file names were kept). */
export async function DELETE(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getBook(id))) return bad("not_found", 404);
  const [d, err] = await parseBody(req, z.object({ name: z.string().max(255) }));
  if (err) return err;
  const pictures = await removePdfPages(id, d.name);
  for (const p of pictures) await removeUpload(p);
  return NextResponse.json({ removed: pictures.length });
}
