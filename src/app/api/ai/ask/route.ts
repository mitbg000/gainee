import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { parseBody } from "@/lib/api";
import { AiError, chatStream } from "@/lib/ai/client";
import { ASK_ACTIONS, askMessages } from "@/lib/ai/prompts";
import { getProfile } from "@/lib/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Input = z.object({
  action: z.enum(ASK_ACTIONS),
  selection: z.string().trim().min(1).max(6000),
  context: z.string().max(4000).optional(),
  question: z.string().max(2000).optional(),
  feedbackKind: z.string().max(50).optional(),
  prompt: z.string().max(4000).optional(),
  lessonId: z.number().int().positive().optional(),
  annotationId: z.number().int().positive().optional(),
  override: z.object({ providerId: z.number().int().positive(), model: z.string().min(1).max(100) }).optional(),
});

/**
 * Streams the AI answer as plain text. The saved message id is returned in `x-message-id`
 * so the client can pin it to the margin afterwards.
 */
export async function POST(req: Request) {
  const [data, err] = await parseBody(req, Input);
  if (err) return err;
  const profile = await getProfile();
  const task = data.action === "feedback" ? "writing_grade" : "reader_quick";
  const messages = askMessages(data.action, data, profile);
  const db = getDb();
  const [{ id }] = await db
    .insert(schema.aiMessages)
    .values({
      lessonId: data.lessonId ?? null,
      annotationId: data.annotationId ?? null,
      action: data.action === "vocab_card" ? "custom" : data.action, // DB enum predates vocab cards
      selection: data.selection.slice(0, 6000),
      context: data.context ?? null,
      question: data.action === "feedback" ? (data.feedbackKind ?? null) : (data.question ?? null), // feedback: the practice kind, for its history
    })
    .$returningId();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        const gen = chatStream({ task, messages, temperature: 0.4, maxTokens: data.action === "feedback" ? 1200 : 600, override: data.override, timeoutMs: 90_000 }, req.signal);
        let step = await gen.next();
        while (!step.done) {
          full += step.value;
          controller.enqueue(encoder.encode(step.value));
          step = await gen.next();
        }
        await db.update(schema.aiMessages).set({ answer: full, providerId: step.value.providerId, model: step.value.model }).where(eq(schema.aiMessages.id, id));
      } catch (e) {
        const msg = e instanceof AiError && e.code === "not_configured" ? "⚠️ AI_NOT_CONFIGURED" : `⚠️ ${e instanceof Error ? e.message : String(e)}`;
        controller.enqueue(encoder.encode(`${full ? "\n\n" : ""}${msg}`));
        if (!full) await db.delete(schema.aiMessages).where(eq(schema.aiMessages.id, id));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-message-id": String(id), "x-accel-buffering": "no" } });
}
