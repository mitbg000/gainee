import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { fetchModels } from "@/lib/ai/client";

export const runtime = "nodejs";

/** Model list for a provider that is being added (not saved yet); empty when it cannot be loaded. */
export async function POST(req: Request) {
  const [data, err] = await parseBody(req, z.object({ baseUrl: z.string().trim().url().max(500), apiKey: z.string().trim().min(8).max(500) }));
  if (err) return err;
  return NextResponse.json(await fetchModels(data.baseUrl, data.apiKey).catch(() => []));
}
