import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { SecurityConfig, setSecurity } from "@/lib/security";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";

const Input = SecurityConfig.omit({ turnstileSecretEnc: true }).extend({ turnstileSecret: z.string().trim().max(200).optional() });

/** AI limits and the sign-up captcha. The Turnstile secret is write-only: it is never sent back to the browser. */
export async function PUT(req: Request) {
  if (!(await requireRole("admin"))) return bad("forbidden", 403);
  const [d, err] = await parseBody(req, Input);
  if (err) return err;
  const { turnstileSecret, ...rest } = d;
  await setSecurity(rest, turnstileSecret || undefined);
  return NextResponse.json({ ok: true });
}
