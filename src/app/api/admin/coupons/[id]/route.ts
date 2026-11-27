import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, idParam, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await requireRole("admin"))) return bad("forbidden", 403);
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [d, err] = await parseBody(req, z.object({ active: z.boolean() }));
  if (err) return err;
  await getDb().update(schema.coupons).set(d).where(eq(schema.coupons.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await requireRole("admin"))) return bad("forbidden", 403);
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  await getDb().delete(schema.coupons).where(eq(schema.coupons.id, id));
  return NextResponse.json({ ok: true });
}
