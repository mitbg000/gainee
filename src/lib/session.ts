/** Login session as an HS256-signed JWT – works in middleware (Edge) and Node. */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rl_session";
export const SESSION_DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not set (needs at least 32 characters)");
  return new TextEncoder().encode(s);
}

/** Short fingerprint of the password hash: changing the password (APP_PASSWORD_HASH) ends every existing session. */
async function passwordVersion(hash = process.env.APP_PASSWORD_HASH ?? "") {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hash)));
  return [...d.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(username: string, passwordHash?: string): Promise<string> {
  return new SignJWT({ sub: username, pv: await passwordVersion(passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.pv === (await passwordVersion());
  } catch {
    return false;
  }
}
