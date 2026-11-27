import { NextResponse } from "next/server";
import { getSepay, takePayment, verifySepay, Webhook } from "@/lib/payments";

export const runtime = "nodejs";

/**
 * SePay webhook (public; checked by API key or HMAC). SePay counts a call as delivered only with 200 + {"success": true},
 * so every transfer we have looked at (matched or not, duplicate or not) answers that; only a bad signature does not.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const cfg = await getSepay();
  if (!cfg.enabled) return NextResponse.json({ success: false, error: "disabled" }, { status: 503 });
  if (!verifySepay(cfg, req.headers, raw)) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false, error: "bad_json" }, { status: 400 });
  }
  const p = Webhook.safeParse(body);
  if (!p.success) return NextResponse.json({ success: false, error: "invalid" }, { status: 400 });
  const result = await takePayment(p.data, body as Record<string, unknown>);
  return NextResponse.json({ success: true, result });
}
