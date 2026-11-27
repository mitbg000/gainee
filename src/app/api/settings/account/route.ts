import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, parseBody } from "@/lib/api";
import { currentUser } from "@/lib/users";

export const runtime = "nodejs";

/** The user's own display name (empty: the e-mail is shown). */
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return bad("unauthorized", 401);
  const [d, err] = await parseBody(req, z.object({ name: z.string().trim().max(100) }));
  if (err) return err;
  await getDb().update(schema.users).set({ name: d.name || null }).where(eq(schema.users.id, u.id));
  return NextResponse.json({ ok: true });
}
