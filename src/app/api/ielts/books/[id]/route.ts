import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { deleteBook, getBook, listBooks, renameBook } from "@/lib/ielts/queries";
import { removeUpload } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Status while the worker reads the book (polled by the book page). */
export async function GET(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const b = id ? (await listBooks()).find((x) => x.id === id) : undefined;
  if (!b) return bad("not_found", 404);
  return NextResponse.json({ status: b.status, error: b.error, progress: b.job?.status === "running" || b.job?.status === "queued" ? (b.job.progress ?? "") : null, tests: b.tests.length });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getBook(id))) return bad("not_found", 404);
  for (const f of await deleteBook(id)) await removeUpload(f);
  return NextResponse.json({ ok: true });
}

/** Rename: { title }. */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getBook(id))) return bad("not_found", 404);
  const [d, err] = await parseBody(req, z.object({ title: z.string().trim().min(1).max(191) }));
  if (err) return err;
  await renameBook(id, d.title);
  return NextResponse.json({ ok: true });
}
