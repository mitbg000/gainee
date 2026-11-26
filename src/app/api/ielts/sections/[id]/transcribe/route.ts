import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { getSection } from "@/lib/ielts/queries";
import { enqueue } from "@/lib/jobs";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Queue a transcript from the part's audio (worker job "ielts_transcribe"); the review screen polls /api/jobs/<id>. */
export async function POST(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  const s = id ? await getSection(id) : null;
  if (!s) return bad("not_found", 404);
  if (s.section.skill !== "listening" || !s.section.audio) return bad("no_audio");
  return NextResponse.json({ jobId: await enqueue("ielts_transcribe", { sectionId: id }, { maxAttempts: 2 }) });
}
