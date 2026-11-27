import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { addCredits } from "@/lib/credits";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";

/** Give (or take back, when negative) credits by hand. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireRole("admin"))) return bad("forbidden", 403);
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [d, err] = await parseBody(req, z.object({ amount: z.number().min(-1e7).max(1e7).refine((n) => n !== 0), note: z.string().trim().max(255).optional() }));
  if (err) return err;
  try {
    return NextResponse.json({ balance: await addCredits(id, d.amount, "admin", d.note || null) });
  } catch {
    return bad("not_found", 404);
  }
}
