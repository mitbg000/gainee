import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { getBook, queueForBook } from "@/lib/ielts/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Queue splitting the book's audioscripts again by test (worker job "ielts_resplit_scripts"). */
export async function POST(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getBook(id))) return bad("not_found", 404);
  return NextResponse.json({ jobId: await queueForBook("ielts_resplit_scripts", id) });
}
