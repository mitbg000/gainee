"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Top-up packages: asking for one gives a code to write in the bank transfer; the admin then adds the credits. */
export default function BuyPackage({ packages, payInfo }: { packages: { credits: number; price: string }[]; payInfo: string }) {
  const t = useTranslations("credits");
  const router = useRouter();
  const [busy, setBusy] = useState(-1);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function ask(index: number) {
    setBusy(index);
    setError("");
    const r = await fetch("/api/credits/topup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ index }) }).catch(() => null);
    setBusy(-1);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) return setError(j?.error === "too_many_pending" ? t("tooMany") : t("failed"));
    setDone(j.id);
    router.refresh();
  }

  return (
    <>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {packages.map((p, i) => (
          <button key={i} disabled={busy >= 0} onClick={() => ask(i)} className="flex flex-col items-start rounded-xl border border-line p-3 text-left transition-colors hover:border-accent">
            <span className="font-serif text-2xl font-bold tabular-nums">{p.credits.toLocaleString()}</span>
            <span className="text-xs text-muted">credit</span>
            <span className="mt-1 text-sm font-semibold text-accent">{busy === i ? t("sending") : p.price}</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {done !== null && (
        <div className="mt-3 rounded-xl bg-accent/10 p-3 text-sm">
          <p>{t("asked", { code: `GN${done}` })}</p>
          {payInfo && <p className="mt-2 whitespace-pre-line">{payInfo}</p>}
        </div>
      )}
    </>
  );
}
