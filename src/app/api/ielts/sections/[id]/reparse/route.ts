import { NextResponse } from "next/server";
import { bad, idParam, aiRefused } from "@/lib/api";
import { reparseSection } from "@/lib/ielts/import";

export const runtime = "nodejs";
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

/** Read this section's pages again with AI (replaces its questions, keeps answers and pictures). */
export async function POST(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("not_found", 404);
  try {
    const c = await reparseSection(id);
    return c ? NextResponse.json(c) : bad("not_found", 404);
  } catch (e) {
    const refused = aiRefused(e);
    if (refused) return refused;
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
