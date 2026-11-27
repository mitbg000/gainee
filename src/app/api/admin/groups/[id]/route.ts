import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, idParam, parseBody } from "@/lib/api";
import { FEATURES, requireRole } from "@/lib/users";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Rename, the group's feature switches (missing = role default), its members (the whole list). */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await requireRole("admin"))) return bad("forbidden", 403);
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [d, err] = await parseBody(
    req,
    z.object({ name: z.string().trim().min(1).max(100).optional(), features: z.record(z.enum(FEATURES), z.boolean()).nullable().optional(), members: z.array(z.number().int().positive()).max(5000).optional() }),
  );
  if (err) return err;
  const db = getDb();
  const { members, ...rest } = d;
  await db.transaction(async (tx) => {
    if (Object.keys(rest).length) await tx.update(schema.groups).set(rest).where(eq(schema.groups.id, id));
    if (members) {
      await tx.delete(schema.userGroups).where(eq(schema.userGroups.groupId, id));
      if (members.length) await tx.insert(schema.userGroups).values([...new Set(members)].map((userId) => ({ userId, groupId: id })));
    }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await requireRole("admin"))) return bad("forbidden", 403);
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  await getDb().delete(schema.groups).where(eq(schema.groups.id, id));
  return NextResponse.json({ ok: true });
}
