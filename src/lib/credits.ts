/**
 * Credits: learners pay for AI by the tokens it reads and writes, at a price per model set by the admin.
 * Admins are not charged. The balance may go a little below zero on the call that uses it up; the next call is refused.
 */
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getSetting, setSetting } from "@/lib/settings";

const Price = z.object({ in: z.number().min(0), out: z.number().min(0) }); // credits per 1 million tokens
export const CreditConfig = z.object({
  allowSignup: z.boolean().default(false),
  signupBonus: z.number().min(0).max(1e6).default(0),
  default: Price.default({ in: 0, out: 0 }),
  models: z.record(z.string().max(100), Price).default({}),
  image: z.number().min(0).default(0), // credits per AI picture
  packages: z.array(z.object({ credits: z.number().positive(), price: z.number().int().min(0) })).max(20).default([]), // price in VND
  payInfo: z.string().max(2000).default(""), // how to pay, shown on the top-up page
  // a top-up of any amount (VND) at a fixed price per credit, from a minimum
  customEnabled: z.boolean().default(false),
  customMin: z.number().int().min(1000).max(1e9).default(20000),
  customPerCredit: z.number().positive().max(1e7).default(500), // VND per credit
});
export type CreditConfig = z.infer<typeof CreditConfig>;

export const getCreditConfig = async () => CreditConfig.parse((await getSetting("credits.config")) ?? {});
export const setCreditConfig = (c: CreditConfig) => setSetting("credits.config", c);

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** Credits for a top-up of `amount` VND at the custom rate (2 decimals). */
export const customCredits = (c: CreditConfig, amount: number) => Math.floor((amount / c.customPerCredit) * 100) / 100;

/** Price of one AI reply. */
export function aiCost(c: CreditConfig, model: string, promptTokens = 0, completionTokens = 0) {
  const p = c.models[model] ?? c.default;
  return round((promptTokens * p.in + completionTokens * p.out) / 1e6);
}

/** Add (or take, when negative) credits and log it; returns the new balance. */
export async function addCredits(userId: number, amount: number, kind: (typeof schema.creditLogs.$inferInsert)["kind"], note?: string | null, aiCallId?: number) {
  const db = getDb();
  amount = round(amount);
  return db.transaction(async (tx) => {
    await tx.update(schema.users).set({ credits: sql`ROUND(${schema.users.credits} + ${amount}, 4)` }).where(eq(schema.users.id, userId));
    const [u] = await tx.select({ credits: schema.users.credits }).from(schema.users).where(eq(schema.users.id, userId));
    if (!u) throw new Error("no_user");
    await tx.insert(schema.creditLogs).values({ userId, amount, balance: u.credits, kind, note: note?.slice(0, 255) ?? null, aiCallId });
    return u.credits;
  });
}

export const creditHistory = (userId: number, limit = 100) =>
  getDb().select().from(schema.creditLogs).where(eq(schema.creditLogs.userId, userId)).orderBy(desc(schema.creditLogs.id)).limit(limit);
