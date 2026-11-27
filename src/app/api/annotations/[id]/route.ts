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
  const [data, err] = await parseBody(
    req,
    z.object({ color: z.enum(["yellow", "green", "blue", "pink", "purple"]).optional(), note: z.string().max(5000).nullable().optional() }),
  );
  if (err) return err;
  await getDb()
    .update(schema.annotations)
    .set({ ...data, ...(data.note !== undefined ? { note: data.note || null } : {}) })
    .where(and(eq(schema.annotations.id, id), eq(schema.annotations.userId, await myId())));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  await getDb().delete(schema.annotations).where(and(eq(schema.annotations.id, id), eq(schema.annotations.userId, await myId())));
  return NextResponse.json({ ok: true });
}
