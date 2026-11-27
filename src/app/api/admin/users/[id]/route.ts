import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { ROLES } from "@/db/schema";
import { bad, idParam, parseBody } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { FEATURES, requireRole } from "@/lib/users";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Input = z.object({
  name: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  features: z.record(z.enum(FEATURES), z.boolean()).nullable().optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
  logoutAll: z.boolean().optional(),
});

/** Role, feature switches, lock, new password. A new password or a lock ends the user's sessions. */
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await requireRole("admin");
  if (!me) return bad("forbidden", 403);
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [d, err] = await parseBody(req, Input);
  if (err) return err;
  if (id === me.id && ((d.role && d.role !== "admin") || d.disabled)) return bad("not_yourself"); // never lock out the last way in
  const { password, logoutAll, ...rest } = d;
  const res = await getDb()
    .update(schema.users)
    .set({
      ...rest,
      ...(password ? { passwordHash: hashPassword(password) } : {}),
      ...(password || logoutAll || d.disabled ? { sessionVersion: sql`${schema.users.sessionVersion} + 1` } : {}),
    })
    .where(eq(schema.users.id, id));
  if ((res as unknown as [{ affectedRows: number }])[0].affectedRows === 0) return bad("not_found", 404);
  return NextResponse.json({ ok: true });
}
