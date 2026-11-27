import { NextResponse, type NextRequest } from "next/server";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { blocked, clientIp, failed, loggedIn, passed } from "@/lib/auth";
import { hashPassword, safeEqual, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

const DUMMY = hashPassword("timing-only"); // checked when the account does not exist, so timing tells nothing

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (blocked(ip)) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });

  const { username, password } = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const login = String(username ?? "").trim().toLowerCase();
  const db = getDb();
  let [u] = login ? await db.select().from(schema.users).where(eq(schema.users.email, login)) : [];

  // first start: no accounts yet → the owner in .env (APP_USERNAME / APP_PASSWORD_HASH) becomes the first admin
  if (!u && login && process.env.APP_PASSWORD_HASH && safeEqual(login, (process.env.APP_USERNAME || "admin").trim().toLowerCase())) {
    const [{ n }] = await db.select({ n: count() }).from(schema.users);
    if (n === 0 && password && verifyPassword(password, process.env.APP_PASSWORD_HASH)) {
      await db.insert(schema.users).values({ email: login, name: login, passwordHash: process.env.APP_PASSWORD_HASH.trim(), role: "admin" });
      [u] = await db.select().from(schema.users).where(eq(schema.users.email, login));
    }
  }

  const ok = verifyPassword(String(password ?? ""), u?.passwordHash ?? DUMMY) && !!u;
  if (!ok) {
    await failed(ip);
    return NextResponse.json({ error: "wrong_credentials" }, { status: 401 });
  }
  if (u.disabled) return NextResponse.json({ error: "locked" }, { status: 403 });
  passed(ip);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  return loggedIn(req, u);
}
