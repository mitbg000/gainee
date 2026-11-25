import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { getTest, renameTest } from "@/lib/ielts/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Rename a test: { title }. */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getTest(id))) return bad("not_found", 404);
  const [d, err] = await parseBody(req, z.object({ title: z.string().trim().min(1).max(191) }));
  if (err) return err;
  await renameTest(id, d.title);
  return NextResponse.json({ ok: true });
}
