import { z } from "zod";
import { parseBody } from "@/lib/api";
import { AiError, chatStream } from "@/lib/ai/client";
import { getProfile } from "@/lib/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Input = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(40),
});

/** Free conversation with the AI tutor; streams plain text. */
export async function POST(req: Request) {
  const [data, err] = await parseBody(req, Input);
  if (err) return err;
  const p = await getProfile();
  const lang = p.explainIn === "vi" ? "Vietnamese" : "English";
  const system = `You are a friendly, precise English and IELTS tutor for a Vietnamese learner (CEFR ${p.level}, target IELTS band ${p.targetBand}).
Explain in ${lang} unless asked otherwise; keep English examples in English. Correct the learner's English mistakes briefly when they write in English.
Use short Markdown (bold, italics, bullet lists). Be concise.`;
  const messages = [{ role: "system" as const, content: system }, ...data.messages.slice(-20)];

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let any = false;
      try {
        const gen = chatStream({ task: "chat", messages, temperature: 0.6, maxTokens: 1500, timeoutMs: 90_000 }, req.signal);
        for (let step = await gen.next(); !step.done; step = await gen.next()) {
          any = true;
          controller.enqueue(enc.encode(step.value));
        }
      } catch (e) {
        const msg = e instanceof AiError && e.code === "not_configured" ? "⚠️ AI_NOT_CONFIGURED" : `⚠️ ${e instanceof Error ? e.message : String(e)}`;
        controller.enqueue(enc.encode(`${any ? "\n\n" : ""}${msg}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
