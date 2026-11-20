import { NextResponse } from "next/server";
import type { ZodType } from "zod";

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
