"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { findPartMarks, type PartMarks } from "@/lib/ielts/partMarks";
import * as I from "@/components/icons";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Run Whisper in the browser on one stored recording, then save the part marks (applied to the Listening parts). */
export async function saveMarks(audioId: number, src: Blob | string, onProgress: (msg: string, pct: number) => void) {
  const marks = await findPartMarks(src, onProgress);
  if (!Object.keys(marks).length) return { marks, parts: 0 };
  const r = await fetch(`/api/ielts/audio/${audioId}/marks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marks }) });
  return { marks, parts: r.ok ? ((await r.json()).parts as number) : 0 };
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
      const r = await saveMarks(id, `/api/ielts/audio/${id}`, (step, pct) => setBusy(t(`step.${step}`, { pct: Math.round(pct * 100) })));
      setMarks(r.marks);
      setMsg(Object.keys(r.marks).length ? t("done", { found: Object.keys(r.marks).length, parts: r.parts }) : t("none"));
      router.refresh();
    } catch (e) {
      setMsg(String(e));
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
