import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { aiClean } from "@/lib/listen/aiClean";

export const runtime = "nodejs";
export const maxDuration = 600;

const Row = z.object({ i: z.number().int().min(0), start: z.number(), end: z.number(), text: z.string().max(5000), speaker: z.string().max(64).nullable(), hidden: z.boolean(), heard: z.string().max(5000).optional() });

/** The review editor's unsaved sentences → cleaned and joined by AI (each result keeps `i` of its first line). */
export async function POST(req: Request) {
  const [data, err] = await parseBody(req, z.object({ rows: z.array(Row).min(1).max(3000) }));
  if (err) return err;
  return NextResponse.json(await aiClean(data.rows));
}
