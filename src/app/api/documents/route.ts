import { NextResponse, type NextRequest } from "next/server";
import { createDocument, ImportError, parseImportForm } from "@/lib/documents/create";
import { listDocuments } from "@/lib/documents/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const labelIds = sp.getAll("label").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return NextResponse.json(await listDocuments({ labelIds, q: sp.get("q")?.slice(0, 100) || undefined }));
}

export async function POST(req: NextRequest) {
  try {
    const input = await parseImportForm(await req.formData());
    return NextResponse.json({ id: await createDocument(input) }, { status: 201 });
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
