"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

const post = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

/** Edit a lesson's raw text: delete unrelated parts, fix paragraphs, split ("---") or merge, then regenerate the exercises. */
export default function LessonEditor({ lessonId, paragraphs, hasNext, onClose }: { lessonId: number; paragraphs: string[]; hasNext: boolean; onClose: () => void }) {
  const t = useTranslations("lesson.edit");
  const router = useRouter();
  const [text, setText] = useState(paragraphs.join("\n\n"));
  const [regen, setRegen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(req: Promise<Response>) {
    setBusy(true);
    setError("");
    const r = await req.catch(() => null);
    if (!r?.ok) {
      setBusy(false);
      return setError(t("failed"));
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-6" role="dialog" aria-modal>
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col gap-3 rounded-t-2xl bg-paper p-4 shadow-xl md:rounded-2xl md:p-5">
        <h2 className="font-serif text-xl font-bold">{t("title")}</h2>
        <p className="text-sm text-muted">{t("help")}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[40dvh] flex-1 resize-y rounded-xl border border-line bg-card p-3 font-serif text-[15px] leading-relaxed"
          spellCheck={false}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={regen} onChange={(e) => setRegen(e.target.checked)} />
          {t("regenerate")}
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={busy || !text.trim()} onClick={() => run(post(`/api/lessons/${lessonId}/text`, "PUT", { text, regenerate: regen }))} className="min-h-11 rounded-xl bg-accent px-5 text-sm font-medium text-on-accent disabled:opacity-50">
            {busy ? "…" : t("save")}
          </button>
          <button disabled={busy} onClick={onClose} className="min-h-11 rounded-xl border border-line px-4 text-sm">
            {t("cancel")}
          </button>
          {hasNext && (
            <button disabled={busy} onClick={() => confirm(t("mergeConfirm")) && run(post(`/api/lessons/${lessonId}/merge`, "POST"))} className="ml-auto min-h-11 rounded-xl border border-line px-4 text-sm">
              {t("merge")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
