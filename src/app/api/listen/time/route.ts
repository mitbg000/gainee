import { NextResponse } from "next/server";
import { z } from "zod";
import { bumpActivity } from "@/lib/activity";
import { parseBody } from "@/lib/api";

export const runtime = "nodejs";

/** Listening time with no sentence result (listen-only chunks, sentences repeated in a session): counts for the streak. */
export async function POST(req: Request) {
  const [data, err] = await parseBody(req, z.object({ minutes: z.number().int().min(1).max(30) }));
  if (err) return err;
  await bumpActivity({ minutes: data.minutes });
  return NextResponse.json({ ok: true });
}
