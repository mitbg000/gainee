import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, idParam, parseBody } from "@/lib/api";
import { recordResult } from "@/lib/listen/queries";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Input = z.object({
  first: z.boolean(),
  hinted: z.boolean(),
  misses: z.record(z.string().max(20), z.number().int().min(0).max(100)),
  mode: z.enum(["review", "random", "source"]),
  minutes: z.number().int().min(0).max(30).optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, Input);
  if (err) return err;
  const r = await recordResult(id, data);
  return r ? NextResponse.json(r) : bad("not_found", 404);
}
