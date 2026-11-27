import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, parseBody } from "@/lib/api";
import { getCreditConfig } from "@/lib/credits";
import { currentUser } from "@/lib/users";

export const runtime = "nodejs";

/** Ask for one of the admin's packages; the admin adds the credits once the payment arrives. */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return bad("unauthorized", 401);
  const [d, err] = await parseBody(req, z.object({ index: z.number().int().min(0) }));
  if (err) return err;
  const pack = (await getCreditConfig()).packages[d.index];
  if (!pack) return bad("invalid");
  const db = getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.topups).where(and(eq(schema.topups.userId, u.id), eq(schema.topups.status, "pending")));
  if (n >= 3) return bad("too_many_pending", 429);
  const [{ id }] = await db.insert(schema.topups).values({ userId: u.id, credits: pack.credits, price: pack.price }).$returningId();
  return NextResponse.json({ id });
}
