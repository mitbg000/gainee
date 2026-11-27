import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, idParam, parseBody } from "@/lib/api";
import { audioOfSource, queueClips } from "@/lib/listen/clips";
import { setPosition } from "@/lib/listen/queries";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, z.object({ title: z.string().trim().min(1).max(255).optional(), shift: z.number().min(-30).max(30).optional(), reviewed: z.boolean().optional(), position: z.number().int().min(0).optional() }));
  if (err) return err;
  const { position, ...rest } = data;
  if (position !== undefined) await setPosition(id, position); // each learner's own place in "dictate the whole video"
  if (!Object.keys(rest).length) return NextResponse.json({ ok: true });
  if (!(await requireRole("editor"))) return bad("forbidden", 403); // the rest is the editors' review
  await getDb().update(schema.listenSources).set(rest).where(eq(schema.listenSources.id, id));
  // sentences confirmed: cut their audio ahead, so practice never waits for the whole recording
  if (data.reviewed) await queueClips(await audioOfSource(id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const audioId = await audioOfSource(id);
  await getDb().delete(schema.listenSources).where(eq(schema.listenSources.id, id));
  await queueClips(audioId); // its clips go
  return NextResponse.json({ ok: true });
}
