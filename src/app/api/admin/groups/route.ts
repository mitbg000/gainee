import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await requireRole("admin"))) return bad("forbidden", 403);
  const [d, err] = await parseBody(req, z.object({ name: z.string().trim().min(1).max(100) }));
  if (err) return err;
  const [{ id }] = await getDb().insert(schema.groups).values({ name: d.name }).$returningId();
  return NextResponse.json({ id }, { status: 201 });
}
