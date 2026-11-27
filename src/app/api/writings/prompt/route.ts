import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody, aiRefused } from "@/lib/api";
import { generatePrompt, Override, WRITING_KINDS } from "@/lib/writing";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  const [data, err] = await parseBody(req, z.object({ kind: z.enum(WRITING_KINDS), override: Override }));
  if (err) return err;
  try {
    return NextResponse.json({ prompt: await generatePrompt(data.kind, data.override) });
  } catch (e) {
    const refused = aiRefused(e);
    if (refused) return refused;
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
