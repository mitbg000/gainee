import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, parseBody } from "@/lib/api";
import { CODE, CouponError, discounted, take, usable } from "@/lib/coupons";
import { addCredits, getCreditConfig } from "@/lib/credits";
import { getSepay, qrUrl, sepayOn, topupCode } from "@/lib/payments";
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
    if (price === 0) {
      // fully discounted: nothing to transfer
      await db.update(schema.topups).set({ status: "done", doneAt: new Date(), note: "100%" }).where(eq(schema.topups.id, id));
      await addCredits(u.id, pack.credits, "topup", topupCode(id));
      return NextResponse.json({ id, price, code: topupCode(id), done: true });
    }
    const sepay = await getSepay();
    const pay = sepayOn(sepay) ? { qr: qrUrl(sepay, price, topupCode(id)), bank: sepay.bank, account: sepay.account, holder: sepay.holder } : null;
    return NextResponse.json({ id, price, code: topupCode(id), pay });
  } catch (e) {
    if (e instanceof CouponError) return bad(e.message);
    throw e;
  }
}
