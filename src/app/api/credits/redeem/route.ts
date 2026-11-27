import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { clientIp, blocked, failed } from "@/lib/auth";
import { CODE, CouponError, redeemGift } from "@/lib/coupons";
import { currentUser } from "@/lib/users";

export const runtime = "nodejs";

/** Enter a gift code → its credits. Wrong codes count like wrong passwords (no guessing codes). */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return bad("unauthorized", 401);
  const ip = clientIp(req);
  if (blocked(`code:${u.id}`, false) || blocked(`code:${ip}`, false)) return bad("too_many_attempts", 429);
  const [d, err] = await parseBody(req, z.object({ code: CODE }));
  if (err) return err;
  try {
    return NextResponse.json({ balance: await redeemGift(d.code, u.id) });
  } catch (e) {
    if (!(e instanceof CouponError)) throw e;
    if (e.message === "bad_code") {
      await failed(`code:${u.id}`, false);
      await failed(`code:${ip}`, false);
    }
    return bad(e.message, 400);
  }
}
