/**
 * YouTube captions for the listening bank. There is no official API for other people's captions: the watch page is
 * read like a browser does and its caption track fetched. YouTube changes or blocks this from time to time (often from
 * server IPs), so callers fall back to a transcript the learner pastes.
 */
import { chat } from "@/lib/ai/client";
import type { TWord } from "./segment";
import { cueWords } from "./segment";

export function youtubeId(url: string): string | null {
  const s = url.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? null;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Video title from YouTube's public oEmbed endpoint. */
export async function youtubeTitle(id: string): Promise<string | null> {
  const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r?.ok) return null;
  return ((await r.json().catch(() => null)) as { title?: string } | null)?.title ?? null;
}

type Track = { baseUrl: string; languageCode: string; kind?: string };
type Json3 = { events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string; tOffsetMs?: number }[] }[] };

/** The JSON array that follows `"captionTracks":` in the watch page. */
function captionTracks(html: string): Track[] {
  const at = html.indexOf('"captionTracks":');
  if (at < 0) return [];
  const start = html.indexOf("[", at);
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === "[") depth++;
    else if (html[i] === "]" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1)) as Track[];
      } catch {
        return [];
      }
    }
  }
  return [];
}

/** Timed words of a json3 caption track: automatic captions have a time per word, the uploader's per line. */
export function json3Words(j: Json3): TWord[] {
  const out: TWord[] = [];
  for (const ev of j.events ?? []) {
    const segs = (ev.segs ?? []).filter((s) => s.utf8 && s.utf8.trim());
    if (!segs.length || ev.tStartMs === undefined) continue;
    const s0 = ev.tStartMs / 1000;
    const e0 = s0 + (ev.dDurationMs ?? 0) / 1000;
    if (segs.length === 1) {
      out.push(...cueWords([{ s: s0, e: e0, text: segs[0].utf8!.replace(/\s+/g, " ").trim() }]));
      continue;
    }
    segs.forEach((seg, i) => {
      const s = s0 + (seg.tOffsetMs ?? 0) / 1000;
      const next = segs[i + 1];
      const e = next ? s0 + (next.tOffsetMs ?? 0) / 1000 : e0;
      for (const w of seg.utf8!.trim().split(/\s+/)) out.push({ w, s, e: Math.max(s + 0.05, e) });
    });
  }
  // [Music] and the like are not speech
  return out.filter((w) => !/^\[.*\]$/.test(w.w));
}

export class CaptionError extends Error {}

export async function fetchCaptions(id: string): Promise<{ words: TWord[]; kind: "manual" | "auto" }> {
  const page = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!page?.ok) throw new CaptionError("captions_blocked");
  const tracks = captionTracks(await page.text()).filter((t) => t.languageCode?.startsWith("en"));
  if (!tracks.length) throw new CaptionError("no_captions");
  const track = tracks.find((t) => t.kind !== "asr") ?? tracks[0];
  const url = `${track.baseUrl.replace(/\\u0026/g, "&").replace(/&fmt=[^&]*/, "")}&fmt=json3`;
  const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const body = r?.ok ? await r.text() : "";
  if (!body.trim()) throw new CaptionError("captions_blocked");
  const words = json3Words(JSON.parse(body) as Json3);
  if (!words.length) throw new CaptionError("no_captions");
  return { words, kind: track.kind === "asr" ? "auto" : "manual" };
}

const norm = (w: string) => w.toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}']/gu, "");

/**
 * Automatic captions have no punctuation, so sentences cannot be found. The AI adds punctuation and capitals in pieces
 * of 250 words; a piece whose words came back changed is kept as it was (the cut then falls on pauses).
 */
export async function punctuate(words: TWord[]): Promise<TWord[]> {
  const enders = words.filter((w) => /[.!?]$/.test(w.w)).length;
  if (enders >= words.length / 30) return words;
  const out = [...words];
  for (let i = 0; i < words.length; i += 250) {
    const part = words.slice(i, i + 250);
    try {
      const { text } = await chat({
        task: "reader_quick",
        temperature: 0,
        maxTokens: 2000,
        timeoutMs: 90_000,
        messages: [
          { role: "system", content: "You add punctuation and capital letters to speech transcripts. Never add, remove, reorder or change any word. Reply with the text only." },
          { role: "user", content: part.map((w) => w.w).join(" ") },
        ],
      });
      const got = text.trim().split(/\s+/);
      if (got.length === part.length && got.every((g, k) => norm(g) === norm(part[k].w))) got.forEach((g, k) => (out[i + k] = { ...part[k], w: g }));
    } catch {
      // keep this piece unpunctuated
    }
  }
  return out;
}
