import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, idParam, parseBody } from "@/lib/api";
import { myId } from "@/lib/owner";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, z.object({ pinned: z.boolean(), annotationId: z.number().int().positive().nullable().optional() }));
  if (err) return err;
  await getDb()
    .update(schema.aiMessages)
    .set({ pinned: data.pinned, ...(data.annotationId !== undefined ? { annotationId: data.annotationId } : {}) })
    .where(and(eq(schema.aiMessages.id, id), eq(schema.aiMessages.userId, await myId())));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  await getDb().delete(schema.aiMessages).where(and(eq(schema.aiMessages.id, id), eq(schema.aiMessages.userId, await myId())));
  return NextResponse.json({ ok: true });
}
