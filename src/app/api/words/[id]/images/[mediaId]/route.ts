import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { removeWordImage } from "@/lib/images";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const mediaId = idParam((await params).mediaId);
  if (!mediaId) return bad("invalid");
  await removeWordImage(mediaId);
  return NextResponse.json({ ok: true });
}
