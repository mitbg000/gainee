import { NextResponse, type NextRequest } from "next/server";
import { verifyPassword } from "@/lib/password";
import { createSession, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";

export const runtime = "nodejs";

// Brute-force protection: 5 failed attempts per 15 minutes per IP (in memory – fine for one user).
const failures = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const f = failures.get(ip);
  if (f && f.n >= 5 && f.until > Date.now()) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !verifyPassword(password, process.env.APP_PASSWORD_HASH)) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + WINDOW_MS };
    cur.n++;
    failures.set(ip, cur);
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "wrong_password" }, { status: 401 });
  }
  failures.delete(ip);

  const https = req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
  return res;
}
