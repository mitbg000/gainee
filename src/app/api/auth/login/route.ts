import { NextResponse, type NextRequest } from "next/server";
import { safeEqual, verifyPassword } from "@/lib/password";
import { createSession, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";

export const runtime = "nodejs";

// Brute-force protection (in memory – fine for one user):
//  - 5 failed attempts per 15 minutes per client IP
//  - 20 failed attempts per 15 minutes in total, so faking the IP does not allow unlimited guesses
const failures = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const PER_IP = 5;
const TOTAL = 20;

/** Client IP: Cloudflare's header, else the address Nginx saw. X-Forwarded-For's first entry is sent by the client, so it is not trusted. */
const clientIp = (req: NextRequest) => req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "local";

function blocked(key: string, max: number) {
  const f = failures.get(key);
  return !!f && f.n >= max && f.until > Date.now();
}
function fail(key: string) {
  const f = failures.get(key);
  const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + WINDOW_MS };
  cur.n++;
  failures.set(key, cur);
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (blocked(ip, PER_IP) || blocked("*", TOTAL)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const { username, password } = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const expectedUser = (process.env.APP_USERNAME || "admin").trim().toLowerCase();
  // Always run the (slow) password check so timing does not reveal whether the username exists.
  const passOk = !!password && verifyPassword(password, process.env.APP_PASSWORD_HASH);
  const userOk = !!username && safeEqual(username.trim().toLowerCase(), expectedUser);
  if (!userOk || !passOk) {
    fail(ip);
    fail("*");
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "wrong_credentials" }, { status: 401 });
  }
  failures.delete(ip);

  // Secure in production (the site is HTTPS-only behind Cloudflare, even when Cloudflare reaches Nginx over HTTP);
  // COOKIE_SECURE=0 allows logging in over plain http, e.g. a local production build.
  const https =
    process.env.COOKIE_SECURE === "0"
      ? false
      : process.env.NODE_ENV === "production" || req.headers.get("x-forwarded-proto") === "https" || (req.headers.get("cf-visitor") ?? "").includes("https") || req.nextUrl.protocol === "https:";
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(expectedUser, process.env.APP_PASSWORD_HASH), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
  return res;
}
