import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { parseBody } from "@/lib/api";
import { blocked, clientIp, failed, loggedIn } from "@/lib/auth";
import { addCredits, getCreditConfig } from "@/lib/credits";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";

const Input = z.object({ email: z.string().trim().toLowerCase().email().max(191), password: z.string().min(8).max(200), name: z.string().trim().max(100).optional() });

/** Sign up as a learner (when the admin allows it), with the welcome credits. No e-mail check yet. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (blocked(ip)) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  const cfg = await getCreditConfig();
  if (!cfg.allowSignup) return NextResponse.json({ error: "signup_closed" }, { status: 403 });
  const [d, err] = await parseBody(req, Input);
  if (err) return err;
  const db = getDb();
  if ((await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, d.email))).length) {
    await failed(ip); // also slows down probing which e-mails have accounts
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }
  const [{ id }] = await db.insert(schema.users).values({ email: d.email, name: d.name || null, passwordHash: hashPassword(d.password), lastLoginAt: new Date() }).$returningId();
  if (cfg.signupBonus > 0) await addCredits(id, cfg.signupBonus, "signup");
  return loggedIn(req, { id, role: "student", sessionVersion: 0 });
}
