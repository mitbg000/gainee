import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { getBook, queueForBook } from "@/lib/ielts/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Queue the AI repair of every broken Listening transcript of the book (worker job "ielts_fix_scripts"). */
export async function POST(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getBook(id))) return bad("not_found", 404);
  return NextResponse.json({ jobId: await queueForBook("ielts_fix_scripts", id) });
}
