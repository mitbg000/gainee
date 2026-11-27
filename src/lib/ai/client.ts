/**
 * One client for every OpenAI-compatible chat API (DeepSeek, OpenAI, Gemini, xAI, custom).
 * - Picks provider + model per task from settings "ai.routing" (falls back to the first enabled provider)
 * - JSON mode with automatic retry without `response_format` for providers that reject it
 * - Streaming (SSE) for the reader panel
 * - Automatic fallback route and usage logging in `ai_calls`
 * - Charged to the user it runs for (lib/credits): refused when their feature is off or the balance is used up
 */
import { getDb, schema } from "@/db";
import { actorId } from "@/lib/actor";
import { addCredits, aiCost, getCreditConfig } from "@/lib/credits";
import { getSetting } from "@/lib/settings";
import { canUse, getUser, type Feature, type User } from "@/lib/users";
import { getProvider, listProviders } from "./providers";
import type { AiRoute, AiRouting, AiTask } from "./tasks";

/** Text, or text + pictures (OpenAI-style parts; needs a vision model, e.g. GPT-4o, Gemini, Grok). */
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };
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
    public code: "not_configured" | "http" | "timeout" | "bad_response" | "no_credits" | "forbidden" = "http",
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
    return (await getDb().insert(schema.aiCalls).values(entry).$returningId())[0]?.id;
  } catch (e) {
    console.error("[ai] cannot log call:", e);
  }
}

/** The user this call is for, once it may run; null = the system's own work (not charged). */
async function gate(feature: Feature): Promise<User | null> {
  const id = await actorId();
  if (!id) return null;
  const u = await getUser(id);
  if (!u || u.disabled) throw new AiError("Account locked", "forbidden", 403);
  if (!canUse(u, feature)) throw new AiError("This AI feature is switched off for your account", "forbidden", 403);
  if (u.role !== "admin" && u.credits <= 0) throw new AiError("Not enough credits: top up on the Credits page", "no_credits", 402);
  return u;
}

/** Log a successful call and take its price from the user's balance (admins are not charged). */
async function logPaid(u: User | null, entry: typeof schema.aiCalls.$inferInsert, credits: number) {
  const callId = await log({ ...entry, userId: u?.id ?? null, credits: u ? credits : null });
  if (u && u.role !== "admin" && credits > 0) await addCredits(u.id, -credits, "ai", entry.task, callId).catch((e) => console.error("[ai] cannot charge:", e));
}

// shortcut: streamed replies carry no token counts, so ~4 characters a token (pictures not counted); upgrade with stream_options.include_usage
const guessTokens = (m: ChatMessage[]) =>
  Math.ceil(m.reduce((n, x) => n + (typeof x.content === "string" ? x.content.length : x.content.reduce((k, p) => k + (p.type === "text" ? p.text.length : 0), 0)), 0) / 4);

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
  const user = await gate(opts.task);
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
      const cost = aiCost(await getCreditConfig(), model, result.promptTokens ?? guessTokens(opts.messages), result.completionTokens ?? Math.ceil(text.length / 4));
      await logPaid(user, { providerId: provider.id, model, task: opts.task, ok: true, durationMs: Date.now() - t0, promptTokens: result.promptTokens, completionTokens: result.completionTokens }, cost);
      return result;
    } catch (e) {
      lastErr = e;
      const timeout = e instanceof Error && e.name === "TimeoutError";
      await log({ providerId: route.providerId, userId: user?.id ?? null, model: route.model, task: opts.task, ok: false, durationMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
      if (e instanceof AiError && e.code === "not_configured" && routes.length === 1) throw e;
      if (timeout) lastErr = new AiError("AI request timed out", "timeout");
    }
  }
  throw lastErr;
}

/** Streaming completion: yields text chunks. */
export async function* chatStream(opts: ChatOptions, signal?: AbortSignal): AsyncGenerator<string, ChatResult> {
  const user = await gate(opts.task);
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
    const pt = guessTokens(opts.messages);
    const ct = Math.ceil(full.length / 4);
    await logPaid(user, { providerId: provider.id, model, task: opts.task, ok: true, durationMs: Date.now() - t0, promptTokens: pt, completionTokens: ct }, aiCost(await getCreditConfig(), model, pt, ct));
    return { text: full, providerId: provider.id, model };
  } catch (e) {
    await log({ providerId: route.providerId, userId: user?.id ?? null, model: route.model, task: opts.task, ok: false, durationMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
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
  const body = raw.slice(start, end + 1);
  try {
    return JSON.parse(body) as T;
  } catch {
    try {
      return JSON.parse(looseJson(body)) as T;
    } catch {
      throw new AiError("AI reply contained invalid JSON", "bad_response");
    }
  }
}

/**
 * Fix the slips models make in long JSON (a passage copied into a string): raw line breaks and tabs inside strings,
 * quotes inside a string that are not escaped (a quote ends the string only when JSON follows it: } ] : or a comma
 * before the next value – not `"primitive", the …`),
 * and commas before } or ].
 */
export function looseJson(s: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!inStr) {
      if (c === '"') inStr = true;
      else if (c === "," && /^\s*[}\]]/.test(s.slice(i + 1, i + 40))) continue;
      out += c;
    } else if (c === "\\") {
      out += c + (s[i + 1] ?? "");
      i++;
    } else if (c === '"') {
      if (/^\s*([}\]:]|$|,\s*(["{[]|-?\d|true\b|false\b|null\b|$))/.test(s.slice(i + 1, i + 40))) {
        inStr = false;
        out += c;
      } else out += '\\"';
    } else out += c === "\n" ? "\\n" : c === "\r" ? "\\r" : c === "\t" ? "\\t" : c;
  }
  return out;
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
  const user = await gate("images");
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
    await logPaid(user, { providerId, model, task: "image", ok: true, durationMs: Date.now() - t0 }, (await getCreditConfig()).image);
    return bytes;
  } catch (e) {
    await log({ providerId, userId: user?.id ?? null, model, task: "image", ok: false, durationMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
    throw e;
  }
}
