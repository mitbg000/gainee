import { NextResponse, type NextRequest } from "next/server";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { blocked, clientIp, failed, loggedIn, passed } from "@/lib/auth";
import { claimOrphans } from "@/lib/owner";
import { hashPassword, safeEqual, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

const DUMMY = hashPassword("timing-only"); // checked when the account does not exist, so timing tells nothing

/** Every try goes to login_logs (the admin's security page); a failed log write never blocks a login. */
const note = (v: typeof schema.loginLogs.$inferInsert) => getDb().insert(schema.loginLogs).values({ ...v, login: v.login.slice(0, 191) }).catch(() => {});

export async function POST(req: NextRequest) {
  const ip = clientIp(req).slice(0, 64);
  if (blocked(ip)) {
    await note({ login: "", ip, ok: false, reason: "blocked" });
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

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
    await note({ userId: u?.id ?? null, login, ip, ok: false, reason: u ? "password" : "no_account" });
    await failed(ip);
    return NextResponse.json({ error: "wrong_credentials" }, { status: 401 });
  }
  if (u.disabled) {
    await note({ userId: u.id, login, ip, ok: false, reason: "locked" });
    return NextResponse.json({ error: "locked" }, { status: 403 });
  }
  await note({ userId: u.id, login, ip, ok: true });
  passed(ip);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  if (u.role === "admin") await claimOrphans(u.id); // once: the one-user data becomes the first admin's
  return loggedIn(req, u);
}
