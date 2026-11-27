import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { bad, idParam, parseBody } from "@/lib/api";
import { acceptSuggestions, deleteDocument, dismissSuggestions, getDocument, setDocumentLabels, setVisibility } from "@/lib/documents/queries";
import { canEditDoc } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const doc = id ? await getDocument(id) : null;
  return doc ? NextResponse.json(doc) : bad("not_found", 404);
}

const Patch = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  author: z.string().trim().max(255).nullable().optional(),
  source: z.string().trim().max(1000).nullable().optional(),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullable().optional(),
  labelIds: z.array(z.number().int().positive()).max(50).optional(),
  acceptSuggestions: z.object({ topics: z.array(z.string().max(100)).max(10), source: z.string().max(200).nullable() }).optional(),
  dismissSuggestions: z.literal(true).optional(),
  visibility: z.enum(["private", "public", "groups"]).optional(),
  groupIds: z.array(z.number().int().positive()).max(100).optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, Patch);
  if (err) return err;
  const { labelIds, acceptSuggestions: acc, dismissSuggestions: dis, visibility, groupIds, ...fields } = data;
  // the text itself and who sees it: its owner and admins; labels are each learner's own
  if ((Object.keys(fields).length || visibility) && !(await canEditDoc(id))) return bad("forbidden", 403);
  if (visibility) await setVisibility(id, visibility, groupIds ?? []);
  if (Object.keys(fields).length) await getDb().update(schema.documents).set(fields).where(eq(schema.documents.id, id));
  if (labelIds) await setDocumentLabels(id, labelIds);
  if (acc) await acceptSuggestions(id, acc.topics, acc.source);
  if (dis) await dismissSuggestions(id);
  return NextResponse.json(await getDocument(id));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  await deleteDocument(id);
  return NextResponse.json({ ok: true });
}
