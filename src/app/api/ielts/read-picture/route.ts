import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { AiError } from "@/lib/ai/client";
import { readPicture } from "@/lib/ielts/import";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Review screen: AI copies the questions in a cropped picture as gap text with [[n]] blanks. */
export async function POST(req: Request) {
  const [d, err] = await parseBody(req, z.object({ image: z.string().max(500), from: z.number().int().min(1).max(60), to: z.number().int().min(1).max(60), instructions: z.string().max(1000) }));
  if (err) return err;
  try {
    return NextResponse.json({ text: await readPicture(d.image, d.from, d.to, d.instructions) });
  } catch (e) {
    if (e instanceof AiError && e.code === "not_configured") return bad("ai_not_configured", 409);
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
