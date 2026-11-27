/** Logging in and signing up: brute-force limits and the session cookie. */
import { NextResponse } from "next/server";
import type { User } from "@/lib/users";
import { cookieOptions, createSession } from "@/lib/session";

// Brute-force protection (in memory, one Next process): 5 failures per 15 min per client IP, 50 in total
// (so faking the IP does not allow unlimited guesses).
const failures = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;

/** Client IP: Cloudflare's header, else the address Nginx saw. X-Forwarded-For's first entry is sent by the client, so it is not trusted. */
export const clientIp = (req: Request) => req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "local";

/** `global` false: a limit of its own (e.g. gift codes per user), apart from the logins' overall one. */
export function blocked(ip: string, global = true) {
  const over = (key: string, max: number) => {
    const f = failures.get(key);
    return !!f && f.n >= max && f.until > Date.now();
  };
  return over(ip, 5) || (global && over("*", 50));
}

export async function failed(ip: string, global = true) {
  for (const key of global ? [ip, "*"] : [ip]) {
    const f = failures.get(key);
    const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + WINDOW_MS };
    cur.n++;
    failures.set(key, cur);
  }
  await new Promise((r) => setTimeout(r, 400));
}

export const passed = (ip: string) => failures.delete(ip);

export async function loggedIn(req: Request, u: Pick<User, "id" | "role" | "sessionVersion">) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("rl_session", await createSession({ uid: u.id, role: u.role, sv: u.sessionVersion }), cookieOptions(req));
  return res;
}
