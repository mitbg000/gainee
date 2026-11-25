import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { cancelJob } from "@/lib/jobs";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Cancel a job: a waiting one never starts, a running one stops at its next step. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("not_found", 404);
  await cancelJob(id);
  return NextResponse.json({ ok: true });
}
