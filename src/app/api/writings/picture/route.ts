import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { addPicture } from "@/lib/writing";

export const runtime = "nodejs";
export const maxDuration = 180;

/** Task 1 question → the same question with an AI picture added; { prompt: null } when there is nothing to draw. */
export async function POST(req: Request) {
  const [data, err] = await parseBody(req, z.object({ prompt: z.string().max(8000) }));
  if (err) return err;
  try {
    return NextResponse.json({ prompt: await addPicture(data.prompt) });
  } catch (e) {
    console.error("[writing] picture failed:", e);
    return bad(e instanceof Error ? e.message.slice(0, 300) : "error", 502);
  }
}
