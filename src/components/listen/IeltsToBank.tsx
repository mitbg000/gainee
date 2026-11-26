"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import * as I from "@/components/icons";
import { localAudio } from "@/lib/ielts/audioCache";
import { LIB } from "@/lib/ielts/partMarks";
import { silences, type TWord } from "@/lib/listen/segment";

const MODEL = "Xenova/whisper-tiny.en";
const RATE = 16000;
const WINDOW = 28; // seconds per Whisper pass (it hears 30 s at most), cut in a quiet place

type Chunk = { text: string; timestamp: [number, number | null] };
type Asr = (pcm: Float32Array, o: Record<string, unknown>) => Promise<{ text: string; chunks?: Chunk[] }>;

/** Windows of at most WINDOW seconds that end in a pause, so no word is cut in two. */
function windows(len: number, quiet: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let from = 0; from < len - 0.5; ) {
    const limit = Math.min(len, from + WINDOW);
    const q = limit >= len ? null : quiet.filter(([a, b]) => (a + b) / 2 > from + 10 && (a + b) / 2 <= limit).at(-1);
    const to = q ? (q[0] + q[1]) / 2 : limit;
    out.push([from, to]);
    from = to;
  }
  return out;
}

/**
 * IELTS Listening part → listening bank. Whisper (in this browser, free) hears the part and gives a time for every
 * word; the server matches those words to the audioscript, so the sentences keep the book's exact words.
 */
export default function IeltsToBank({ sectionId, audio, hasScript, sourceId }: { sectionId: number; audio: { url: string; start: number | null; end: number | null }; hasScript: boolean; sourceId: number | null }) {
  const t = useTranslations("listen.ielts");
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (sourceId && !confirm(t("redoConfirm"))) return;
    setError(null);
    try {
      setStatus(t("step.audio", { pct: 0 }));
      const url = await localAudio(audio.url, (p) => setStatus(t("step.audio", { pct: Math.round(p * 100) })));
      const ctx = new AudioContext({ sampleRate: RATE });
      const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      void ctx.close();
      const all = buf.getChannelData(0);
      const from = audio.start ?? 0;
      const pcm = all.subarray(Math.floor(from * RATE), audio.end ? Math.floor(audio.end * RATE) : all.length);
      const quiet = silences(pcm, RATE);

      setStatus(t("step.model", { pct: 0 }));
      const lib = await import(/* webpackIgnore: true */ LIB);
      lib.env.allowLocalModels = false;
      lib.env.remoteHost = `${location.origin}/api/ielts/hf/`;
      const files: Record<string, { loaded: number; total: number }> = {};
      const asr: Asr = await lib.pipeline("automatic-speech-recognition", MODEL, {
        device: "wasm",
        dtype: "q8",
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status !== "progress" || !p.file || !p.total) return;
          files[p.file] = { loaded: p.loaded ?? 0, total: p.total };
          const v = Object.values(files);
          setStatus(t("step.model", { pct: Math.round((v.reduce((a, f) => a + f.loaded, 0) / v.reduce((a, f) => a + f.total, 0)) * 100) }));
        },
      });

      const heard: TWord[] = [];
      let wordTimes = true; // a time per word when the model allows it, else per phrase (spread over its words)
      const ws = windows(pcm.length / RATE, quiet);
      for (const [k, [a, b]] of ws.entries()) {
        setStatus(t("step.listen", { n: k + 1, total: ws.length }));
        const piece = pcm.subarray(Math.floor(a * RATE), Math.floor(b * RATE));
        let out;
        try {
          out = await asr(piece, { return_timestamps: wordTimes ? "word" : true });
        } catch (e) {
          if (!wordTimes) throw e;
          wordTimes = false;
          out = await asr(piece, { return_timestamps: true });
        }
        for (const c of out.chunks ?? []) {
          const s = c.timestamp[0] + a;
          const e = (c.timestamp[1] ?? b - a) + a;
          const parts = c.text.trim().split(/\s+/).filter(Boolean);
          parts.forEach((w, q) => heard.push({ w, s: from + s + ((e - s) * q) / parts.length, e: from + s + ((e - s) * (q + 1)) / parts.length }));
        }
      }

      setStatus(t("step.save"));
      const r = await fetch("/api/listen/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sectionId, heard: heard.map((h) => ({ w: h.w.slice(0, 100), s: Math.max(0, h.s), e: Math.max(0, h.e) })), quiet: quiet.map(([x, y]) => [x + from, y + from]) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      router.push(`/listen/${j.id}/edit`);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!hasScript) return <span className="text-xs text-muted">{t("noScript")}</span>;
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      {sourceId && (
        <Link href={`/listen/${sourceId}`} className="btn btn-sm btn-secondary">
          <I.IconHeadphones /> {t("open")}
        </Link>
      )}
      <button onClick={run} disabled={!!status} className="btn btn-sm btn-ghost" title={t("hint")}>
        <I.IconPen /> {sourceId ? t("redo") : t("add")}
      </button>
      {status && <span className="animate-pulse text-muted">{status}</span>}
      {error && <span className="text-red-600">{t("failed", { error })}</span>}
    </span>
  );
}
