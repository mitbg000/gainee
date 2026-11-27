import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { bad, parseBody } from "@/lib/api";
import { CouponInput, normCode } from "@/lib/coupons";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await requireRole("admin"))) return bad("forbidden", 403);
  const [d, err] = await parseBody(req, CouponInput);
  if (err) return err;
  try {
    const [{ id }] = await getDb()
      .insert(schema.coupons)
      .values({ ...d, code: normCode(d.code), note: d.note || null, ...(d.kind === "gift" ? { percent: 0, amount: 0 } : { credits: 0 }) })
      .$returningId();
    return NextResponse.json({ id }, { status: 201 });
  } catch {
    return bad("duplicate", 409); // unique code
  }
}
