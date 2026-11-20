import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { editLessonText, parseEditedText } from "@/lib/lessons/edit";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** { text, regenerate? } – blank line = paragraph, a line of "---" = split into a new lesson. */
export async function PUT(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, z.object({ text: z.string().max(200_000), regenerate: z.boolean().default(true) }));
  if (err) return err;
  const parts = parseEditedText(data.text);
  if (!parts.length) return bad("empty");
  const r = await editLessonText(id, parts, data.regenerate);
  return r ? NextResponse.json(r) : bad("not_found", 404);
}
