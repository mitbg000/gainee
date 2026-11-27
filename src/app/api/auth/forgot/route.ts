import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { blocked, clientIp, failed } from "@/lib/auth";
import { requestReset } from "@/lib/passwordReset";

export const runtime = "nodejs";

/** Always answers ok (whether the e-mail has an account stays unknown); each ask counts against the IP's limit. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (blocked(`forgot:${ip}`, false)) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  const [d, err] = await parseBody(req, z.object({ email: z.string().trim().email().max(191) }));
  if (err) return err;
  await failed(`forgot:${ip}`, false); // 5 asks per 15 minutes per IP
  // not awaited: the answer comes as fast whether or not a mail goes out
  requestReset(d.email).catch((e) => console.error("[forgot] cannot send:", e instanceof Error ? e.message : e));
  return NextResponse.json({ ok: true });
}
