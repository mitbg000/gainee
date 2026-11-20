import { NextResponse } from "next/server";
import { bad, idParam, parseBody } from "@/lib/api";
import { removeWord, updateWord, WordPatch } from "@/lib/words";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  await removeWord(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, WordPatch);
  if (err) return err;
  await updateWord(id, data);
  return NextResponse.json({ ok: true });
}
