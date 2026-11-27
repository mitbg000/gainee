import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, idParam, parseBody } from "@/lib/api";
import { release } from "@/lib/coupons";
import { addCredits } from "@/lib/credits";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";

/** Payment arrived → add the package's credits; or turn the request down. Each request is settled once. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireRole("admin"))) return bad("forbidden", 403);
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [d, err] = await parseBody(req, z.object({ approve: z.boolean() }));
  if (err) return err;
  const db = getDb();
  const [row] = await db.select().from(schema.topups).where(eq(schema.topups.id, id));
  if (!row) return bad("not_found", 404);
  const res = await db
    .update(schema.topups)
    .set({ status: d.approve ? "done" : "rejected", doneAt: new Date() })
    .where(and(eq(schema.topups.id, id), eq(schema.topups.status, "pending")));
  if ((res as unknown as [{ affectedRows: number }])[0].affectedRows === 0) return bad("already_settled", 409); // a double click adds nothing
  if (d.approve) await addCredits(row.userId, row.credits, "topup", `GN${id}`);
  else if (row.couponId) await release(row.couponId, row.userId); // the discount code can be used again
  return NextResponse.json({ ok: true });
}
