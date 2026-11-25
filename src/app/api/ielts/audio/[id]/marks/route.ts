import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { applyMarks, assignAudio, audioTests, getAudio, testOfBook } from "@/lib/ielts/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Part marks found in the browser: { marks: {"1":22,"2":431,…} } → stored and applied to the Listening parts → { parts }. */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("not_found", 404);
  const [d, err] = await parseBody(req, z.object({ marks: z.partialRecord(z.enum(["1", "2", "3", "4"]), z.number().min(0).max(4 * 3600)), test: z.number().int().min(1).max(20).nullable().optional() }));
  if (err) return err;
  const parts = await applyMarks(id, d.marks);
  // a file not used by any test yet goes to the test it announces ("Practice Test One")
  const a = await getAudio(id);
  if (a && d.test && !(await audioTests(a.bookId))[id]) {
    const testId = await testOfBook(a.bookId, d.test);
    if (testId) return NextResponse.json({ parts: await assignAudio(id, testId), test: d.test });
  }
  return NextResponse.json({ parts });
}
