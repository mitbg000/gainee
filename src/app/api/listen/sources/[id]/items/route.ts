import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { saveItems } from "@/lib/listen/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Item = z.object({ id: z.number().int().positive().optional(), start: z.number().min(0), end: z.number().min(0), text: z.string().trim().min(1).max(5000), speaker: z.string().max(64).nullable(), hidden: z.boolean() });

/** The review editor saves the whole list of sentences at once. */
export async function PUT(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, z.object({ items: z.array(Item).max(5000) }));
  if (err) return err;
  await saveItems(id, data.items);
  return NextResponse.json({ ok: true });
}
