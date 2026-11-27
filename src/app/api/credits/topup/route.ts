import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, parseBody } from "@/lib/api";
import { CODE, CouponError, discounted, take, usable } from "@/lib/coupons";
import { getCreditConfig } from "@/lib/credits";
import { currentUser } from "@/lib/users";

export const runtime = "nodejs";

/**
 * Ask for one of the admin's packages, optionally with a discount code; the admin adds the credits once the payment
 * arrives. `preview` only answers the price with the code.
 */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return bad("unauthorized", 401);
  const [d, err] = await parseBody(req, z.object({ index: z.number().int().min(0), code: CODE.optional(), preview: z.boolean().optional() }));
  if (err) return err;
  const pack = (await getCreditConfig()).packages[d.index];
  if (!pack) return bad("invalid");
  let k = null;
  try {
    if (d.code) k = await usable(d.code, u.id, "discount");
  } catch (e) {
    if (e instanceof CouponError) return bad(e.message);
    throw e;
  }
  const price = k ? discounted(pack.price, k) : pack.price;
  if (d.preview) return NextResponse.json({ price, discount: pack.price - price });
  const db = getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.topups).where(and(eq(schema.topups.userId, u.id), eq(schema.topups.status, "pending")));
  if (n >= 3) return bad("too_many_pending", 429);
  try {
    const id = await db.transaction(async (tx) => {
      if (k) await take(tx, k, u.id);
      const [{ id }] = await tx.insert(schema.topups).values({ userId: u.id, credits: pack.credits, price, couponId: k?.id ?? null, discount: pack.price - price }).$returningId();
      return id;
    });
    return NextResponse.json({ id, price });
  } catch (e) {
    if (e instanceof CouponError) return bad(e.message);
    throw e;
  }
}
