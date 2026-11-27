import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { bad, idParam } from "@/lib/api";
import { CANCELLED, closeTopup } from "@/lib/payments";
import { currentUser } from "@/lib/users";

export const runtime = "nodejs";

/** The state of one of the user's own top-up requests (the payment screen asks every few seconds). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  const id = idParam((await params).id);
  if (!u || !id) return bad("not_found", 404);
  const [t] = await getDb().select({ status: schema.topups.status }).from(schema.topups).where(and(eq(schema.topups.id, id), eq(schema.topups.userId, u.id)));
  return t ? NextResponse.json(t) : bad("not_found", 404);
}

/** The user cancels their own waiting request (a discount code used on it can be used again). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  const id = idParam((await params).id);
  if (!u || !id) return bad("not_found", 404);
  return (await closeTopup(id, CANCELLED, u.id)) ? NextResponse.json({ ok: true }) : bad("not_pending", 409);
}
