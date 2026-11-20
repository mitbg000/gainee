import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { removeWord } from "@/lib/words";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  await removeWord(id);
  return NextResponse.json({ ok: true });
}
