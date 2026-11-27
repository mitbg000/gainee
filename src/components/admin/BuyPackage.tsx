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
  const [code, setCode] = useState("");
  const [prices, setPrices] = useState<Record<number, string> | null>(null); // with the discount code

  async function check() {
    setError("");
    const out: Record<number, string> = {};
    for (const [index] of packages.entries()) {
      const r = await fetch("/api/credits/topup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ index, code, preview: true }) }).catch(() => null);
      const j = await r?.json().catch(() => ({}));
      if (!r?.ok) {
        setPrices(null);
        return setError(t.has(`codeErrors.${j?.error}`) ? t(`codeErrors.${j?.error}`) : t("failed"));
      }
      out[index] = j.discount > 0 ? `${Number(j.price).toLocaleString("vi-VN")} ₫` : packages[index].price;
    }
    setPrices(out);
  }

  async function ask(index: number) {
    setBusy(index);
    setError("");
    const r = await fetch("/api/credits/topup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ index, code: prices && code ? code : undefined }) }).catch(() => null);
    setBusy(-1);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) return setError(j?.error === "too_many_pending" ? t("tooMany") : t.has(`codeErrors.${j?.error}`) ? t(`codeErrors.${j?.error}`) : t("failed"));
    setPrices(null);
    setCode("");
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
            <span className="mt-1 text-sm font-semibold text-accent">
              {busy === i ? t("sending") : prices?.[i] && prices[i] !== p.price ? (
                <>
                  <s className="mr-1 font-normal text-muted">{p.price}</s>
                  {prices[i]}
                </>
              ) : (
                p.price
              )}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={code} onChange={(e) => {
          setCode(e.target.value.toUpperCase());
          setPrices(null);
        }} maxLength={40} placeholder={t("discountCode")} autoComplete="off" className="field-sm min-w-0 flex-1 font-mono" aria-label={t("discountCode")} />
        <button onClick={check} disabled={code.trim().length < 3} className="btn btn-sm btn-ghost">
          {t("apply")}
        </button>
      </div>
      {prices && <p className="mt-1 text-xs text-green-700 dark:text-green-400">{t("applied")}</p>}
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
