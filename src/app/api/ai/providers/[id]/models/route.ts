import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { listModels } from "@/lib/ai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Model ids offered by a provider (for the chat model picker); empty when the provider has no /models endpoint. */
export async function GET(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  try {
    return NextResponse.json(await listModels(id));
  } catch {
    return NextResponse.json([]);
  }
}
