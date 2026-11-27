import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, idParam, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** While practising: correct a sentence's words, or report it wrong (hidden until the source is reviewed again). */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, z.object({ text: z.string().trim().min(1).max(5000).optional(), hidden: z.boolean().optional() }));
  if (err) return err;
  if (data.text !== undefined && !(await requireRole("editor"))) return bad("forbidden", 403); // learners only report it
  const db = getDb();
  await db.update(schema.listenItems).set(data).where(eq(schema.listenItems.id, id));
  // an editor's report sends the recording back to review; a learner's report only hides the sentence (editors see it)
  if (data.hidden && (await requireRole("editor"))) {
    const [it] = await db.select({ sourceId: schema.listenItems.sourceId }).from(schema.listenItems).where(eq(schema.listenItems.id, id));
    if (it) await db.update(schema.listenSources).set({ reviewed: false }).where(eq(schema.listenSources.id, it.sourceId));
  }
  return NextResponse.json({ ok: true });
}
