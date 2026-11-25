"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { findPartMarks, type PartMarks } from "@/lib/ielts/partMarks";
import * as I from "@/components/icons";
import { localAudio } from "@/lib/ielts/audioCache";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Run Whisper in the browser on one stored recording, then save the part marks (applied to the Listening parts). */
export async function saveMarks(audioId: number, src: Blob | string, onProgress: (msg: string, pct: number) => void) {
  const { marks, test } = await findPartMarks(src, onProgress);
  if (!Object.keys(marks).length) return { marks, parts: 0 };
  // "test": the test number the recording announces; the server uses it when the file is not attached to a test yet
  const r = await fetch(`/api/ielts/audio/${audioId}/marks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marks, test }) });
  if (!r.ok) throw new Error(`save_failed (HTTP ${r.status})`); // never show marks that were not stored
  return { marks, parts: (await r.json()).parts as number };
}

export default function FindMarks({ id, marks: initial }: { id: number; marks: PartMarks | null }) {
  const t = useTranslations("ielts.marks");
  const router = useRouter();
  const [marks, setMarks] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setMsg(null);
    try {
      const progress = (step: string, pct: number) => setBusy(t(`step.${step}`, { pct: Math.round(pct * 100) }));
      // the same local copy the players use: downloaded once, then the practice pages open it at once
      const src = await localAudio(`/api/ielts/audio/${id}`, (p) => progress("download", p));
      const r = await saveMarks(id, src, progress);
      setMarks(r.marks);
      setMsg(Object.keys(r.marks).length ? t("done", { found: Object.keys(r.marks).length, parts: r.parts }) : t("none"));
      router.refresh();
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      setMsg(code === "lib_timeout" || code === "model_timeout" ? t(`errors.${code}`) : t("errors.failed", { error: code }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {marks && Object.keys(marks).length > 0 && (
        <span className="text-xs text-muted tabular-nums">
          {Object.entries(marks)
            .map(([p, s]) => `P${p} ${mmss(s)}`)
            .join(" · ")}
        </span>
      )}
      {msg && <span className="text-xs text-muted">{msg}</span>}
      <button onClick={run} disabled={!!busy} className="btn btn-sm btn-ghost">
        <I.IconSpark /> {busy ?? (marks ? t("again") : t("find"))}
      </button>
    </span>
  );
}
