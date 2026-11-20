import { NextResponse } from "next/server";
import { bad, idParam, parseBody } from "@/lib/api";
import { deleteProvider, ProviderPatch, updateProvider } from "@/lib/ai/providers";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, ProviderPatch);
  if (err) return err;
  await updateProvider(id, data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  await deleteProvider(id);
  return NextResponse.json({ ok: true });
}
