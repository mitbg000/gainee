import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { setItems } from "@/lib/notebook";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Add saved words to a set (after its last card): { wordIds }, or take them out: { wordIds, remove: true }. */
export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [d, err] = await parseBody(req, z.object({ wordIds: z.array(z.number().int().positive()).min(1).max(5000), remove: z.boolean().optional() }));
  if (err) return err;
  return (await setItems(id, d.wordIds, d.remove)) ? NextResponse.json({ ok: true }) : bad("not_found", 404);
}
