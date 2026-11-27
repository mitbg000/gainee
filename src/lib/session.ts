/** Login session as an HS256-signed JWT – works in middleware (Edge) and Node. */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rl_session";
export const SESSION_DAYS = 30;

export type Session = { uid: number; role: "student" | "editor" | "admin"; sv: number };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not set (needs at least 32 characters)");
  return new TextEncoder().encode(s);
}

export async function createSession(s: Session): Promise<string> {
  return new SignJWT({ uid: s.uid, role: s.role, sv: s.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

/** Signature and expiry only; whether the account is still open is checked against the database in currentUser(). */
export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload: p } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof p.uid !== "number" || typeof p.sv !== "number" || !["student", "editor", "admin"].includes(p.role as string)) return null;
    return { uid: p.uid, role: p.role as Session["role"], sv: p.sv };
  } catch {
    return null;
  }
}

/** The session cookie: Secure in production (HTTPS behind Cloudflare); COOKIE_SECURE=0 allows plain http (local build). */
export function cookieOptions(req: Request) {
  const h = req.headers;
  const https =
    process.env.COOKIE_SECURE === "0"
      ? false
      : process.env.NODE_ENV === "production" || h.get("x-forwarded-proto") === "https" || (h.get("cf-visitor") ?? "").includes("https") || new URL(req.url).protocol === "https:";
  return { httpOnly: true, sameSite: "lax" as const, secure: https, path: "/", maxAge: SESSION_DAYS * 24 * 3600 };
}
