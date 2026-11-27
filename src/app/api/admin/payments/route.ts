import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { SepayConfig, setSepay } from "@/lib/payments";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";

const Input = SepayConfig.omit({ apiKeyEnc: true, hmacEnc: true }).extend({
  apiKey: z.string().trim().max(200).nullable().optional(), // "" keep, null remove
  hmac: z.string().trim().max(200).nullable().optional(),
});

/** SePay settings; the API key and HMAC secret are write-only (never sent back). */
export async function PUT(req: Request) {
  if (!(await requireRole("admin"))) return bad("forbidden", 403);
  const [d, err] = await parseBody(req, Input);
  if (err) return err;
  const { apiKey, hmac, ...rest } = d;
  await setSepay(rest, { apiKey, hmac });
  return NextResponse.json({ ok: true });
}
