/**
 * "Forgot password": a random token is mailed as a link, only its SHA-256 is stored; it works once, for 30 minutes.
 * Asking never tells whether an e-mail has an account.
 */
import crypto from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { getDb, schema } from "@/db";
import { simpleMail, sendMail } from "@/lib/mail";
import { hashPassword } from "@/lib/password";
import { getSecurity } from "@/lib/security";

const R = schema.passwordResets;
const TTL_MS = 30 * 60_000;
const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Mail a reset link if the e-mail belongs to an open account (at most 3 links per account an hour). */
export async function requestReset(email: string) {
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase()));
  if (!u || u.disabled || !u.email.includes("@")) return; // the first admin may have a plain user name
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(R).where(and(eq(R.userId, u.id), gt(R.createdAt, new Date(Date.now() - 3600_000))));
  if (Number(n) >= 3) return;
  const token = crypto.randomBytes(32).toString("base64url");
  await db.insert(R).values({ userId: u.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + TTL_MS) });
  const { siteUrl } = await getSecurity();
  const t = await getTranslations("auth.mail");
  const m = simpleMail(t("title"), [t("hello", { name: u.name || u.email }), t("body")], { label: t("button"), url: `${siteUrl}/reset?token=${token}` }, t("foot"));
  await sendMail(u.email, t("subject"), m.text, m.html);
}

/** A still-valid token's user, or null. */
export async function tokenUser(token: string) {
  const [r] = await getDb()
    .select({ id: R.id, userId: R.userId })
    .from(R)
    .where(and(eq(R.tokenHash, hash(token)), isNull(R.usedAt), gt(R.expiresAt, new Date())));
  return r ?? null;
}

/** Set the new password once; every session of the account ends, other open links stop working. */
export async function resetPassword(token: string, password: string) {
  const r = await tokenUser(token);
  if (!r) return null;
  const db = getDb();
  return db.transaction(async (tx) => {
    const used = await tx.update(R).set({ usedAt: new Date() }).where(and(eq(R.id, r.id), isNull(R.usedAt)));
    if ((used as unknown as [{ affectedRows: number }])[0].affectedRows === 0) return null; // used meanwhile
    await tx.update(R).set({ usedAt: new Date() }).where(and(eq(R.userId, r.userId), isNull(R.usedAt)));
    await tx.update(schema.users).set({ passwordHash: hashPassword(password), sessionVersion: sql`${schema.users.sessionVersion} + 1` }).where(eq(schema.users.id, r.userId));
    return r.userId;
  });
}
