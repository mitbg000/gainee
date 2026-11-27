import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { enqueue, recentJobs } from "@/lib/jobs";
import { currentUser, RANK } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await recentJobs(RANK[u.role] >= RANK.editor ? null : u.id));
}

const Body = z.object({ type: z.enum(["ping"]), payload: z.record(z.string(), z.unknown()).optional() });

/** Phase 0 only allows the "ping" test job (to verify the worker). */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_job_type" }, { status: 400 });
  const id = await enqueue(parsed.data.type, parsed.data.payload ?? {});
  return NextResponse.json({ id }, { status: 201 });
}
