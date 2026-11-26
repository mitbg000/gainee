import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, idParam, parseBody } from "@/lib/api";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, z.object({ title: z.string().trim().min(1).max(255).optional(), shift: z.number().min(-30).max(30).optional(), reviewed: z.boolean().optional(), position: z.number().int().min(0).optional() }));
  if (err) return err;
  await getDb().update(schema.listenSources).set(data).where(eq(schema.listenSources.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  await getDb().delete(schema.listenSources).where(eq(schema.listenSources.id, id));
  return NextResponse.json({ ok: true });
}
