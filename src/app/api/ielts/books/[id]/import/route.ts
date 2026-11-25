import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { getBook, startImport } from "@/lib/ielts/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Queue the AI reading of the book (worker job "ielts_import"); running it again replaces the draft tests. */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getBook(id))) return bad("not_found", 404);
  // body is optional: { resume: true } continues where a stopped reading left off
  const [d, err] = await parseBody(req, z.object({ resume: z.boolean().optional() }).catch({}));
  if (err) return err;
  return NextResponse.json({ jobId: await startImport(id, d.resume === true) });
}
