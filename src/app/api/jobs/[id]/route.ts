import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { cancelJob } from "@/lib/jobs";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** A job's state, for screens that wait on one: { status, progress, result, error }. */
export async function GET(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const j = schema.jobs;
  const [row] = id ? await getDb().select({ status: j.status, progress: j.progress, result: j.result, error: j.error }).from(j).where(eq(j.id, id)) : [];
  return row ? NextResponse.json(row) : bad("not_found", 404);
}

/** Cancel a job: a waiting one never starts, a running one stops at its next step. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("not_found", 404);
  await cancelJob(id);
  return NextResponse.json({ ok: true });
}
