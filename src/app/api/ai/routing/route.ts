import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { AI_TASKS, type AiRouting } from "@/lib/ai/tasks";
import { getSetting, setSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Route = z.object({
  providerId: z.number().int().positive(),
  model: z.string().trim().min(1).max(100),
  temperature: z.number().min(0).max(2).optional(),
  fallback: z.object({ providerId: z.number().int().positive(), model: z.string().trim().min(1).max(100) }).optional(),
});
const Routing = z.object(Object.fromEntries(AI_TASKS.map((t) => [t, Route.nullable().optional()])));

export async function GET() {
  return NextResponse.json((await getSetting<AiRouting>("ai.routing")) ?? {});
}

export async function PUT(req: Request) {
  const [data, err] = await parseBody(req, Routing);
  if (err) return err;
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v)) as AiRouting;
  await setSetting("ai.routing", clean);
  return NextResponse.json(clean);
}
