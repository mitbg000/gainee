import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { getBook, queueForBook } from "@/lib/ielts/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Queue the re-reading of the parts that miss question numbers (worker job "ielts_check"). */
export async function POST(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getBook(id))) return bad("not_found", 404);
  return NextResponse.json({ jobId: await queueForBook("ielts_check", id) });
}
