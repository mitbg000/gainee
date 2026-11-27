import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody, aiRefused } from "@/lib/api";
import { readPicture } from "@/lib/ielts/import";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Review screen: AI copies the questions in a cropped picture as gap text with [[n]] blanks. */
export async function POST(req: Request) {
  const [d, err] = await parseBody(req, z.object({ image: z.string().max(500), from: z.number().int().min(1).max(60), to: z.number().int().min(1).max(60), instructions: z.string().max(1000), answers: z.record(z.string(), z.string().max(300)).optional() }));
  if (err) return err;
  try {
    return NextResponse.json(await readPicture(d.image, d.from, d.to, d.instructions, d.answers));
  } catch (e) {
    const refused = aiRefused(e);
    if (refused) return refused;
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
