/**
 * One client for every OpenAI-compatible chat API (DeepSeek, OpenAI, Gemini, xAI, custom).
 * - Picks provider + model per task from settings "ai.routing" (falls back to the first enabled provider)
 * - JSON mode with automatic retry without `response_format` for providers that reject it
 * - Streaming (SSE) for the reader panel
 * - Automatic fallback route and usage logging in `ai_calls`
 */
import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import { getProvider, listProviders } from "./providers";
import type { AiRoute, AiRouting, AiTask } from "./tasks";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatOptions = {
  task: AiTask;
  messages: ChatMessage[];
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Use this provider/model instead of the configured route (e.g. model picker in the reader). */
  override?: { providerId: number; model: string };
};
export type ChatResult = { text: string; providerId: number; model: string; promptTokens?: number; completionTokens?: number };

export class AiError extends Error {
  constructor(
    message: string,
    public code: "not_configured" | "http" | "timeout" | "bad_response" = "http",
    public status?: number,
  ) {
    super(message);
  }
}

async function resolveRoutes(task: AiTask, override?: ChatOptions["override"]): Promise<AiRoute[]> {
  if (override) return [{ providerId: override.providerId, model: override.model }];
  const routing = (await getSetting<AiRouting>("ai.routing")) ?? {};
  const r = routing[task];
  if (r) return r.fallback ? [r, { ...r.fallback, temperature: r.temperature }] : [r];
  const first = (await listProviders()).find((p) => p.enabled);
  if (!first) throw new AiError("No AI provider configured. Add one in Settings.", "not_configured");
  return [{ providerId: first.id, model: first.defaultModel }];
}

async function log(entry: typeof schema.aiCalls.$inferInsert) {
  try {
    await getDb().insert(schema.aiCalls).values(entry);
  } catch (e) {
    console.error("[ai] cannot log call:", e);
  }
}

async function request(route: AiRoute, opts: ChatOptions, stream: boolean, signal?: AbortSignal) {
  const provider = await getProvider(route.providerId);
  if (!provider || !provider.enabled) throw new AiError("AI provider not found or disabled", "not_configured");

  const body: Record<string, unknown> = {
    model: route.model || provider.defaultModel,
    messages: opts.messages,
    temperature: opts.temperature ?? route.temperature ?? 0.4,
    stream,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.json) body.response_format = { type: "json_object" };

  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 180_000);
  const send = () =>
    fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });

  let res = await send();
  if (!res.ok && res.status === 400 && opts.json) {
    // Some models/providers do not support JSON mode – retry with instructions only.
    const txt = await res.text();
    if (/response_format|json/i.test(txt)) {
      delete body.response_format;
      res = await send();
    } else {
      throw new AiError(`HTTP 400: ${txt.slice(0, 300)}`, "http", 400);
    }
  }
  if (!res.ok) throw new AiError(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, "http", res.status);
  return { res, provider, model: String(body.model) };
}

/** Non-streaming completion. */
export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const routes = await resolveRoutes(opts.task, opts.override);
  let lastErr: unknown;
  for (const route of routes) {
    const t0 = Date.now();
    try {
      const { res, provider, model } = await request(route, opts, false);
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new AiError("Empty response from AI", "bad_response");
      const result = { text, providerId: provider.id, model, promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens };
      await log({ providerId: provider.id, model, task: opts.task, ok: true, durationMs: Date.now() - t0, promptTokens: result.promptTokens, completionTokens: result.completionTokens });
      return result;
    } catch (e) {
      lastErr = e;
      const timeout = e instanceof Error && e.name === "TimeoutError";
      await log({ providerId: route.providerId, model: route.model, task: opts.task, ok: false, durationMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
      if (e instanceof AiError && e.code === "not_configured" && routes.length === 1) throw e;
      if (timeout) lastErr = new AiError("AI request timed out", "timeout");
    }
  }
  throw lastErr;
}

/** Streaming completion: yields text chunks. */
export async function* chatStream(opts: ChatOptions, signal?: AbortSignal): AsyncGenerator<string, ChatResult> {
  const routes = await resolveRoutes(opts.task, opts.override);
  const route = routes[0];
  const t0 = Date.now();
  let full = "";
  try {
    const { res, provider, model } = await request(route, opts, true, signal);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            yield delta;
          }
        } catch {
          /* ignore keep-alives / partial lines */
        }
      }
    }
    await log({ providerId: provider.id, model, task: opts.task, ok: true, durationMs: Date.now() - t0 });
    return { text: full, providerId: provider.id, model };
  } catch (e) {
    await log({ providerId: route.providerId, model: route.model, task: opts.task, ok: false, durationMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
    throw e;
  }
}

/** Parse JSON from a model reply, tolerating ```json fences and text around the object. */
export function parseJsonReply<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new AiError("AI reply did not contain JSON", "bad_response");
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    throw new AiError("AI reply contained invalid JSON", "bad_response");
  }
}

/** Model ids offered at an OpenAI-compatible endpoint (also used before a provider is saved). */
export async function fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new AiError(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, "http", res.status);
  const data = (await res.json()) as { data?: { id: string }[]; models?: { name?: string; id?: string }[] };
  const ids = (data.data ?? data.models ?? []).map((m) => ("id" in m && m.id ? m.id : (m as { name?: string }).name ?? "")).filter(Boolean);
  return ids.map((id) => id.replace(/^models\//, "")).sort();
}

/** Fetch the model list of a provider (used by "Test connection" and the model lists). */
export async function listModels(providerId: number): Promise<string[]> {
  const p = await getProvider(providerId);
  if (!p) throw new AiError("Provider not found", "not_configured");
  return fetchModels(p.baseUrl, p.apiKey);
}

/** One picture from an OpenAI-compatible /images/generations endpoint (OpenAI gpt-image / DALL·E, xAI grok image). */
export async function generateImage(providerId: number, model: string, prompt: string): Promise<Uint8Array> {
  const p = await getProvider(providerId);
  if (!p || !p.enabled) throw new AiError("Image provider not found or disabled", "not_configured");
  const body: Record<string, unknown> = { model, prompt, n: 1 };
  if (model.startsWith("gpt-image")) body.size = "1536x1024"; // gpt-image always answers in base64
  else body.response_format = "b64_json";
  const t0 = Date.now();
  try {
    const res = await fetch(`${p.baseUrl}/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(150_000),
    });
    if (!res.ok) throw new AiError(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, "http", res.status);
    const d = ((await res.json()) as { data?: { b64_json?: string; url?: string }[] }).data?.[0];
    let bytes: Uint8Array | null = null;
    if (d?.b64_json) bytes = new Uint8Array(Buffer.from(d.b64_json, "base64"));
    else if (d?.url) bytes = new Uint8Array(await (await fetch(d.url, { signal: AbortSignal.timeout(60_000) })).arrayBuffer());
    if (!bytes?.length) throw new AiError("No image in the reply", "bad_response");
    await log({ providerId, model, task: "image", ok: true, durationMs: Date.now() - t0 });
    return bytes;
  } catch (e) {
    await log({ providerId, model, task: "image", ok: false, durationMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
    throw e;
  }
}
