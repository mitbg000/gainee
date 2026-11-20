import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import type { ImageSetting } from "@/lib/ai/tasks";
import { getSetting, setSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Input = z.object({ enabled: z.boolean(), providerId: z.number().int().positive(), model: z.string().trim().min(1).max(100) });

export async function GET() {
  return NextResponse.json((await getSetting<ImageSetting>("ai.images")) ?? null);
}

export async function PUT(req: Request) {
  const [data, err] = await parseBody(req, Input);
  if (err) return err;
  await setSetting("ai.images", data);
  return NextResponse.json(data);
}
