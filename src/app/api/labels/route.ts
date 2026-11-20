import { NextResponse, type NextRequest } from "next/server";
import { addIeltsTopics, createLabel, LabelError, LabelInput, listLabels } from "@/lib/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listLabels());
}

/** Create a label, or `{ "preset": "ielts_topics" }` to add the starter topic set. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.preset === "ielts_topics") return NextResponse.json({ added: await addIeltsTopics() });
  const parsed = LabelInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    return NextResponse.json({ id: await createLabel(parsed.data) }, { status: 201 });
  } catch (e) {
    if (e instanceof LabelError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
