/**
 * YouTube captions for the listening bank. There is no official API for other people's captions; this follows
 * youtube-transcript-api (github.com/jdepoix/youtube-transcript-api): read the watch page for the Innertube key, ask
 * the player endpoint as the Android app (the web player's caption links now need a "PO token"), then load the track.
 * YouTube still blocks some server IPs; callers then fall back to a transcript the learner pastes.
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

/** Video title from YouTube's public oEmbed endpoint. */
export async function youtubeTitle(id: string): Promise<string | null> {
  const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r?.ok) return null;
  return ((await r.json().catch(() => null)) as { title?: string } | null)?.title ?? null;
}

type Track = { baseUrl: string; languageCode: string; kind?: string };
type Json3 = { events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string; tOffsetMs?: number }[] }[] };

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

const unescape = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** The plain XML track (<text start="1.2" dur="3.4">…</text>): one time per line. */
export function xmlWords(xml: string): TWord[] {
  const cues = [...xml.matchAll(/<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)].map((m) => ({
    s: Number(m[1]),
    e: Number(m[1]) + Number(m[2] ?? 0),
    // the XML is escaped twice ("&amp;#39;")
    text: unescape(unescape(m[3])).replace(/\s+/g, " ").trim(),
  }));
  // a line's end is where the next one starts (durations overlap in automatic captions)
  const fixed = cues.filter((c) => c.text).map((c, i, all) => ({ ...c, e: Math.min(c.e || Infinity, all[i + 1]?.s ?? c.e) }));
  return cueWords(fixed).filter((w) => !/^\[.*\]$/.test(w.w));
}

export class CaptionError extends Error {}

const HEADERS = { "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" };
const get = (url: string, cookie?: string) => fetch(url, { headers: { ...HEADERS, ...(cookie ? { cookie } : {}) }, signal: AbortSignal.timeout(20_000) }).catch(() => null);

/** The watch page; in the EU YouTube first shows a consent form, answered with a CONSENT cookie. */
async function watchPage(id: string): Promise<{ html: string; cookie?: string }> {
  const url = `https://www.youtube.com/watch?v=${id}`;
  let r = await get(url);
  if (!r?.ok) throw new CaptionError("captions_blocked");
  let html = await r.text();
  if (!html.includes('action="https://consent.youtube.com/s"')) return { html };
  const v = html.match(/name="v" value="(.*?)"/)?.[1];
  if (!v) throw new CaptionError("captions_blocked");
  const cookie = `CONSENT=YES+${v}`;
  r = await get(url, cookie);
  if (!r?.ok) throw new CaptionError("captions_blocked");
  html = await r.text();
  return { html, cookie };
}

export async function fetchCaptions(id: string): Promise<{ words: TWord[]; kind: "manual" | "auto" }> {
  const { html, cookie } = await watchPage(id);
  if (html.includes('class="g-recaptcha"')) throw new CaptionError("captions_blocked");
  const key = html.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/)?.[1];
  if (!key) throw new CaptionError("captions_blocked");

  const r = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${key}`, {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } }, videoId: id }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!r?.ok) throw new CaptionError("captions_blocked");
  const data = (await r.json().catch(() => null)) as {
    playabilityStatus?: { status?: string; reason?: string };
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Track[] } };
  } | null;
  const status = data?.playabilityStatus?.status;
  if (status && status !== "OK") throw new CaptionError(status === "LOGIN_REQUIRED" ? "captions_blocked" : "video_unavailable");

  // English, the uploader's own first; tracks that need a PO token ("&exp=xpe") cannot be read
  const tracks = (data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []).filter((t) => t.languageCode?.startsWith("en") && !t.baseUrl.includes("&exp=xpe"));
  if (!tracks.length) throw new CaptionError("no_captions");
  const track = tracks.find((t) => t.kind !== "asr") ?? tracks[0];
  const base = track.baseUrl.replace("&fmt=srv3", "");

  // json3 gives automatic captions a time per word; the plain XML track only one per line
  let words: TWord[] = [];
  const j = await get(`${base}&fmt=json3`, cookie);
  const body = j?.ok ? await j.text() : "";
  if (body.trim().startsWith("{")) words = json3Words(JSON.parse(body) as Json3);
  if (!words.length) {
    const x = await get(base, cookie);
    const xml = x?.ok ? await x.text() : "";
    if (!xml.trim()) throw new CaptionError("captions_blocked");
    words = xmlWords(xml);
  }
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
