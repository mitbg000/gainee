import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, parseBody } from "@/lib/api";
import { blocked, clientIp, failed, passed } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { currentUser } from "@/lib/users";

export const runtime = "nodejs";

/** Change (or add) the account's e-mail; the current password confirms it. It is also the login from then on. */
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return bad("unauthorized", 401);
  const key = `email:${u.id}`;
  if (blocked(key, false) || blocked(clientIp(req))) return bad("too_many_attempts", 429);
  const [d, err] = await parseBody(req, z.object({ email: z.string().trim().toLowerCase().email().max(191), password: z.string().min(1).max(200) }));
  if (err) return err;
  if (!verifyPassword(d.password, u.passwordHash)) {
    await failed(key, false);
    return bad("wrong_password", 403);
  }
  passed(key);
  const db = getDb();
  const [other] = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.email, d.email), ne(schema.users.id, u.id)));
  if (other) return bad("email_taken", 409);
  await db.update(schema.users).set({ email: d.email }).where(eq(schema.users.id, u.id));
  return NextResponse.json({ ok: true });
}
