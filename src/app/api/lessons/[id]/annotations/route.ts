import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, idParam, parseBody } from "@/lib/api";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Input = z.object({
  paragraph: z.number().int().min(0),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(1),
  quote: z.string().min(1).max(1000),
  prefix: z.string().max(64).optional(),
  suffix: z.string().max(64).optional(),
  color: z.enum(["yellow", "green", "blue", "pink", "purple"]).default("yellow"),
  note: z.string().max(5000).nullable().optional(),
  kind: z.enum(["highlight", "summary"]).default("highlight"),
});

export async function POST(req: Request, { params }: Ctx) {
  const lessonId = idParam((await params).id);
  if (!lessonId) return bad("invalid");
  const [data, err] = await parseBody(req, Input);
  if (err) return err;
  if (data.endOffset <= data.startOffset) return bad("invalid");
  const [{ id }] = await getDb().insert(schema.annotations).values({ lessonId, ...data, note: data.note || null }).$returningId();
  return NextResponse.json({ id }, { status: 201 });
}
