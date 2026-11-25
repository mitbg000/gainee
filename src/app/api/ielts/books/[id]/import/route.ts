import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { getBook, startImport } from "@/lib/ielts/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Queue the AI reading of the book (worker job "ielts_import"); running it again replaces the draft tests. */
export async function POST(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getBook(id))) return bad("not_found", 404);
  return NextResponse.json({ jobId: await startImport(id) });
}
