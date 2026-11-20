import { NextResponse, type NextRequest } from "next/server";
import { deleteLabel, LabelError, LabelPatch, updateLabel } from "@/lib/labels";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const id = Number((await params).id);
  const parsed = LabelPatch.safeParse(await req.json().catch(() => ({})));
  if (!Number.isInteger(id) || !parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await updateLabel(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LabelError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await deleteLabel(id);
  return NextResponse.json({ ok: true });
}
