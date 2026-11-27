/**
 * Security settings the admin changes: AI limits per learner (calls a minute, credits a day, size of one request)
 * and Cloudflare Turnstile on the sign-up form. The Turnstile secret is stored encrypted (ENCRYPTION_KEY).
 */
import { z } from "zod";
import { decrypt, encrypt } from "@/lib/crypto";
import { getSetting, setSetting } from "@/lib/settings";

export const SecurityConfig = z.object({
  aiPerMinute: z.number().int().min(0).max(1000).default(20), // 0 = no limit
  aiCreditsPerDay: z.number().min(0).max(1e7).default(0), // 0 = no limit
  maxInputChars: z.number().int().min(0).max(2_000_000).default(60_000), // text sent to the AI in one call; 0 = no limit
  maxOutputTokens: z.number().int().min(0).max(100_000).default(4000), // 0 = what each feature asks for
  captcha: z.boolean().default(false),
  turnstileSiteKey: z.string().max(200).default(""),
  turnstileSecretEnc: z.string().max(1000).default(""),
});
export type SecurityConfig = z.infer<typeof SecurityConfig>;

export const getSecurity = async () => SecurityConfig.parse((await getSetting("security.config")) ?? {});

/** Save; a new Turnstile secret (plain) replaces the stored one, an empty one keeps it. */
export async function setSecurity(c: Omit<SecurityConfig, "turnstileSecretEnc">, secret?: string) {
  const cur = await getSecurity();
  await setSetting("security.config", { ...c, turnstileSecretEnc: secret ? encrypt(secret) : cur.turnstileSecretEnc });
}

/** Is the captcha really on (switched on and both keys set)? */
export const captchaOn = (c: SecurityConfig) => c.captcha && !!c.turnstileSiteKey && !!c.turnstileSecretEnc;

/** Ask Cloudflare whether the browser solved the Turnstile challenge. */
export async function verifyTurnstile(c: SecurityConfig, token: string | undefined, ip: string) {
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: decrypt(c.turnstileSecretEnc), response: token });
    if (ip !== "local") body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    return !!((await r.json()) as { success?: boolean }).success;
  } catch {
    return false;
  }
}
