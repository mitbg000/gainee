import { NextResponse } from "next/server";
import { bad, idParam } from "@/lib/api";
import { chat, listModels } from "@/lib/ai/client";
import { getProvider } from "@/lib/ai/providers";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Check the key: list models, then send a one-word chat to the default model. */
export async function POST(_req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const p = await getProvider(id);
  if (!p) return bad("not_found", 404);
  let models: string[] = [];
  let modelsError: string | null = null;
  try {
    models = await listModels(id);
  } catch (e) {
    modelsError = e instanceof Error ? e.message : String(e);
  }
  try {
    const r = await chat({
      task: "reader_quick",
      override: { providerId: id, model: p.defaultModel },
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      maxTokens: 5,
      timeoutMs: 30_000,
    });
    return NextResponse.json({ ok: true, reply: r.text.trim().slice(0, 50), models, modelsError });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e), models, modelsError });
  }
}
