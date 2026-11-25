import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { enqueue } from "@/lib/jobs";
import { getBook } from "@/lib/ielts/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Queue the AI repair of every broken Listening transcript of the book (worker job "ielts_fix_scripts"). */
export async function POST(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getBook(id))) return bad("not_found", 404);
  return NextResponse.json({ jobId: await enqueue("ielts_fix_scripts", { bookId: id }, { maxAttempts: 2 }) });
}
