import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { cancelJob } from "@/lib/jobs";
import { currentUser, RANK } from "@/lib/users";

/** Learners see and stop their own jobs; editors and admins every job. */
async function mine(id: number) {
  const u = await currentUser();
  if (!u) return false;
  if (RANK[u.role] >= RANK.editor) return true;
  const [j] = await getDb().select({ userId: schema.jobs.userId }).from(schema.jobs).where(eq(schema.jobs.id, id));
  return j?.userId === u.id;
}

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** A job's state, for screens that wait on one: { status, progress, result, error }. */
export async function GET(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const j = schema.jobs;
  const [row] = id && (await mine(id)) ? await getDb().select({ status: j.status, progress: j.progress, result: j.result, error: j.error }).from(j).where(eq(j.id, id)) : [];
  return row ? NextResponse.json(row) : bad("not_found", 404);
}

/** Cancel a job: a waiting one never starts, a running one stops at its next step. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await mine(id))) return bad("not_found", 404);
  await cancelJob(id);
  return NextResponse.json({ ok: true });
}
