import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { AiError } from "@/lib/ai/client";
import { generatePrompt, Override, WRITING_KINDS } from "@/lib/writing";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  const [data, err] = await parseBody(req, z.object({ kind: z.enum(WRITING_KINDS), override: Override }));
  if (err) return err;
  try {
    return NextResponse.json({ prompt: await generatePrompt(data.kind, data.override) });
  } catch (e) {
    if (e instanceof AiError && e.code === "not_configured") return bad("ai_not_configured", 409);
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
