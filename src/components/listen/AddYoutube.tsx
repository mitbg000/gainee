"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import * as I from "@/components/icons";

/**
 * Add a YouTube video: its captions are fetched on the server; when YouTube refuses (or the video has none) the
 * learner pastes the transcript ("Show transcript" on YouTube, or an .srt / .vtt file's text).
 */
export default function AddYoutube() {
  const t = useTranslations("listen.add");
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/listen/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, ...(paste?.trim() ? { transcript: paste } : {}) }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (r?.ok) return router.push(`/listen/${j.id}/edit`);
    const code = j?.error ?? "network";
    if (code === "captions_blocked" || code === "no_captions") setPaste((p) => p ?? "");
    setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : code);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <p className="font-semibold">
        <I.IconPlay className="inline-block h-4 w-4 align-[-0.2em] text-red-600" /> {t("title")}
      </p>
      <div className="flex flex-wrap gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className="field min-w-0 flex-1" disabled={busy} />
        <button onClick={add} disabled={busy || url.trim().length < 5} className="btn btn-primary">
          {busy ? t("working") : paste !== null ? t("addPasted") : t("add")}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {paste !== null && (
        <div>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} placeholder={"0:00\nHello and welcome…\n0:04\nToday we…"} className="field mt-2 w-full font-mono text-sm" />
        </div>
      )}
      {paste === null && (
        <button onClick={() => setPaste("")} className="text-sm text-accent underline">
          {t("pasteInstead")}
        </button>
      )}
    </div>
  );
}
