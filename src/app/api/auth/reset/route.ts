import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { resetPassword } from "@/lib/passwordReset";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const [d, err] = await parseBody(req, z.object({ token: z.string().min(20).max(200), password: z.string().min(8).max(200) }));
  if (err) return err;
  const userId = await resetPassword(d.token, d.password);
  return userId ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "bad_link" }, { status: 400 });
}
