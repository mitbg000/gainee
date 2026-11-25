import { NextResponse } from "next/server";
import { bad, idParam, parseBody } from "@/lib/api";
import { addAiNote, AiNote } from "@/lib/ielts/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Append an AI explanation to a try's history. */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const [data, err] = await parseBody(req, AiNote);
  if (err) return err;
  return id && (await addAiNote(id, data)) ? NextResponse.json({ ok: true }) : bad("not_found", 404);
}
