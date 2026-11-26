import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { bookPartsToCut, queueCut } from "@/lib/listen/jobs";

export const runtime = "nodejs";

/** Cut IELTS Listening parts into the listening bank in the worker: some parts, or every part of a book not added yet. */
export async function POST(req: Request) {
  const [data, err] = await parseBody(req, z.union([z.object({ sectionIds: z.array(z.number().int().positive()).min(1).max(200) }), z.object({ bookId: z.number().int().positive() })]));
  if (err) return err;
  const ids = "bookId" in data ? await bookPartsToCut(data.bookId) : data.sectionIds;
  if (!ids.length) return bad("nothing_to_add");
  return NextResponse.json({ jobId: await queueCut(ids), parts: ids.length });
}
