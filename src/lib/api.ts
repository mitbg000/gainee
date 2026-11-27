import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { AiError } from "@/lib/ai/client";

/** Parse a JSON body with zod; returns [data] or [null, errorResponse]. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<[T, null] | [null, NextResponse]> {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return [null, NextResponse.json({ error: "invalid", issues: parsed.error.issues.slice(0, 5) }, { status: 400 })];
  }
  return [parsed.data, null];
}

export function idParam(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** An AI call the server refused before it ran (not set up, feature off, no credits) as an answer; null for real failures. */
export function aiRefused(e: unknown) {
  if (!(e instanceof AiError)) return null;
  const code = e.code;
  if (code === "not_configured") return bad("ai_not_configured", 409);
  if (code === "no_credits") return bad("no_credits", 402);
  if (code === "forbidden") return bad("forbidden", 403);
  if (code === "rate_limited" || code === "daily_limit") return bad(code, 429);
  if (code === "too_long") return bad("too_long", 413);
  return null;
}
