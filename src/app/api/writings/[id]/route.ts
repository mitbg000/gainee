import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { bad, idParam, parseBody } from "@/lib/api";
import { getWriting, saveWriting, WritingInput } from "@/lib/writing";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getWriting(id))) return bad("not_found", 404);
  const [data, err] = await parseBody(req, WritingInput);
  if (err) return err;
  await saveWriting(id, data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getWriting(id))) return bad("not_found", 404);
  await getDb().delete(schema.writings).where(eq(schema.writings.id, id));
  return NextResponse.json({ ok: true });
}
