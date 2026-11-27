/** Gift codes (credits at once) and discount codes (cheaper top-up). One use per user; `maxUses` for everyone. */
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { addCredits } from "@/lib/credits";

const c = schema.coupons;
export type Coupon = typeof c.$inferSelect;

export const normCode = (s: string) => s.trim().toUpperCase();
export const CODE = z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/);

export const CouponInput = z
  .object({
    code: CODE,
    kind: z.enum(["gift", "discount"]),
    credits: z.number().min(0).max(1e7).default(0),
    percent: z.number().int().min(0).max(100).default(0),
    amount: z.number().int().min(0).max(1e9).default(0),
    maxUses: z.number().int().positive().nullable().default(null),
    expiresAt: z.coerce.date().nullable().default(null),
    note: z.string().trim().max(255).optional(),
  })
  .refine((x) => (x.kind === "gift" ? x.credits > 0 : x.percent > 0 || x.amount > 0), { message: "empty_coupon" });

export class CouponError extends Error {}

/** The code if this user may use it now, else a CouponError with the reason. */
export async function usable(code: string, userId: number, kind: Coupon["kind"]) {
  const db = getDb();
  const [k] = await db.select().from(c).where(eq(c.code, normCode(code)));
  if (!k || !k.active || k.kind !== kind) throw new CouponError("bad_code");
  if (k.expiresAt && k.expiresAt < new Date()) throw new CouponError("expired");
  if (k.maxUses != null && k.used >= k.maxUses) throw new CouponError("used_up");
  const [mine] = await db.select().from(schema.couponUses).where(and(eq(schema.couponUses.couponId, k.id), eq(schema.couponUses.userId, userId)));
  if (mine) throw new CouponError("already_used");
  return k;
}

/** Count one use (in the caller's transaction); fails when someone took the last use meanwhile or this user already did. */
export async function take(tx: Pick<ReturnType<typeof getDb>, "insert" | "update">, k: Coupon, userId: number) {
  try {
    await tx.insert(schema.couponUses).values({ couponId: k.id, userId });
  } catch {
    throw new CouponError("already_used"); // primary key (coupon, user)
  }
  const res = await tx
    .update(c)
    .set({ used: sql`${c.used} + 1` })
    .where(and(eq(c.id, k.id), or(isNull(c.maxUses), lt(c.used, sql`${c.maxUses}`))));
  if ((res as unknown as [{ affectedRows: number }])[0].affectedRows === 0) throw new CouponError("used_up");
}

/** Give back a use (a top-up request turned down). */
export async function release(couponId: number, userId: number) {
  const db = getDb();
  await db.transaction(async (tx) => {
    const res = await tx.delete(schema.couponUses).where(and(eq(schema.couponUses.couponId, couponId), eq(schema.couponUses.userId, userId)));
    if ((res as unknown as [{ affectedRows: number }])[0].affectedRows) await tx.update(c).set({ used: sql`greatest(${c.used} - 1, 0)` }).where(eq(c.id, couponId));
  });
}

/** Redeem a gift code: its credits are added now. Returns the new balance. */
export async function redeemGift(code: string, userId: number) {
  const k = await usable(code, userId, "gift");
  await getDb().transaction((tx) => take(tx, k, userId));
  return addCredits(userId, k.credits, "gift", k.code);
}

/** A package price after a discount code (never below 0). */
export const discounted = (price: number, k: Pick<Coupon, "percent" | "amount">) => Math.max(0, Math.round((price * (100 - k.percent)) / 100) - k.amount);
