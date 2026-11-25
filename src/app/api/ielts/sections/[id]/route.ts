import { NextResponse } from "next/server";
import { bad, idParam, parseBody } from "@/lib/api";
import { getSection, SectionPatch, updateSection } from "@/lib/ielts/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id || !(await getSection(id))) return bad("not_found", 404);
  const [data, err] = await parseBody(req, SectionPatch);
  if (err) return err;
  await updateSection(id, data);
  return NextResponse.json({ ok: true });
}
