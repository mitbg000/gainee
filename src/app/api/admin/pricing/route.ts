import { NextResponse } from "next/server";
import { bad, parseBody } from "@/lib/api";
import { CreditConfig, setCreditConfig } from "@/lib/credits";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";

/** Prices per model, welcome credits, sign-up on/off, top-up packages. */
export async function PUT(req: Request) {
  if (!(await requireRole("admin"))) return bad("forbidden", 403);
  const [d, err] = await parseBody(req, CreditConfig);
  if (err) return err;
  await setCreditConfig(d);
  return NextResponse.json({ ok: true });
}
