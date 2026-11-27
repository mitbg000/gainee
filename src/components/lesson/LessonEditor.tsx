"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import RichEditor from "@/components/RichEditor";
import { ask } from "@/components/Toaster";

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
        <RichEditor className="min-h-0 flex-1 overflow-y-auto" value={text} onChange={setText} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={regen} onChange={(e) => setRegen(e.target.checked)} />
          {t("regenerate")}
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={busy || !text.trim()} onClick={() => run(post(`/api/lessons/${lessonId}/text`, "PUT", { text, regenerate: regen }))} className="btn btn-primary">
            {busy ? "…" : t("save")}
          </button>
          <button disabled={busy} onClick={onClose} className="btn btn-secondary">
            {t("cancel")}
          </button>
          {hasNext && (
            <button disabled={busy} onClick={async () => (await ask(t("mergeConfirm"))) && run(post(`/api/lessons/${lessonId}/merge`, "POST"))} className="btn btn-secondary ml-auto">
              {t("merge")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
