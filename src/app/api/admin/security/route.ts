import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { SecurityConfig, setSecurity } from "@/lib/security";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";

const Input = SecurityConfig.omit({ turnstileSecretEnc: true, smtpPassEnc: true }).extend({ turnstileSecret: z.string().trim().max(200).optional(), smtpPass: z.string().max(200).optional() });

/** AI limits, the sign-up captcha and e-mail. Secrets are write-only: never sent back to the browser. */
export async function PUT(req: Request) {
  if (!(await requireRole("admin"))) return bad("forbidden", 403);
  const [d, err] = await parseBody(req, Input);
  if (err) return err;
  const { turnstileSecret, smtpPass, ...rest } = d;
  await setSecurity(rest, { turnstile: turnstileSecret || undefined, smtp: smtpPass || undefined });
  return NextResponse.json({ ok: true });
}
