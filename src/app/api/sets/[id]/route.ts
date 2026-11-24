import { NextResponse } from "next/server";
import { bad, idParam, parseBody } from "@/lib/api";
import { deleteSet, getSet, saveSet, SetInput } from "@/lib/sets";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Replace a set's title, description and cards (in order). */
export async function PUT(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  if (!(await getSet(id))) return bad("not_found", 404);
  const [data, err] = await parseBody(req, SetInput);
  if (err) return err;
  return NextResponse.json(await saveSet(id, data));
}

/** Delete the set; its words stay in the notebook. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  await deleteSet(id);
  return NextResponse.json({ ok: true });
}
