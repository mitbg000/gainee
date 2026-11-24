"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Shorten every long saved meaning with AI, one word at a time (each saved as soon as it is done). */
export default function ShortenWords({ ids }: { ids: number[] }) {
  const t = useTranslations("wordList");
  const router = useRouter();
  const [done, setDone] = useState<number | null>(null);
  const [failed, setFailed] = useState(0);
  if (!ids.length) return null;

  async function run() {
    if (!confirm(t("shortenAllConfirm", { n: ids.length }))) return;
    setFailed(0);
    for (let i = 0; i < ids.length; i++) {
      setDone(i);
      const r = await fetch(`/api/words/${ids[i]}/shorten?save=1`, { method: "POST" }).catch(() => null);
      if (!r?.ok) {
        setFailed((f) => f + 1);
        if (r?.status === 409) break; // no AI provider configured
      }
    }
    setDone(null);
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-2.5 text-sm">
      <span className="flex-1 text-muted">{t("longMeanings", { n: ids.length })}</span>
      {failed > 0 && <span className="text-red-600 dark:text-red-400">{t("shortenFailed", { n: failed })}</span>}
      <button onClick={run} disabled={done !== null} className="btn btn-sm btn-secondary">
        {done !== null ? t("shortening", { i: done + 1, n: ids.length }) : t("shortenAll")}
      </button>
    </div>
  );
}
