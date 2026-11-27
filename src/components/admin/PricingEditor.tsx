"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { CreditConfig } from "@/lib/credits";

type Price = { in: number; out: number };

/** Credit prices (per 1 million tokens, per model), sign-up, welcome credits and the top-up packages. */
export default function PricingEditor({ initial, models }: { initial: CreditConfig; models: string[] }) {
  const t = useTranslations("admin.pricing");
  const [c, setC] = useState(initial);
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  const set = (patch: Partial<CreditConfig>) => {
    setC({ ...c, ...patch });
    setState("");
  };
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const setModel = (m: string, p: Price | null) => {
    const next = { ...c.models };
    if (p) next[m] = p;
    else delete next[m];
    set({ models: next });
  };

  async function save() {
    setState("saving");
    const r = await fetch("/api/admin/pricing", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(c) }).catch(() => null);
    setState(r?.ok ? "saved" : "error");
  }

  const box = "rounded-2xl border border-line bg-card p-4";
  const priceInputs = (p: Price, on: (p: Price) => void) => (
    <>
      <input type="number" min={0} step="any" value={p.in} onChange={(e) => on({ ...p, in: num(e.target.value) })} className="field w-24 text-right tabular-nums" aria-label={t("in")} />
      <input type="number" min={0} step="any" value={p.out} onChange={(e) => on({ ...p, out: num(e.target.value) })} className="field w-24 text-right tabular-nums" aria-label={t("out")} />
    </>
  );

  return (
    <div className="space-y-4">
      <div className={box}>
        <p className="font-semibold">{t("signupTitle")}</p>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={c.allowSignup} onChange={(e) => set({ allowSignup: e.target.checked })} />
          {t("allowSignup")}
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          {t("bonus")}
          <input type="number" min={0} step="any" value={c.signupBonus} onChange={(e) => set({ signupBonus: num(e.target.value) })} className="field w-28 text-right tabular-nums" />
        </label>
      </div>

      <div className={box}>
        <p className="font-semibold">{t("ratesTitle")}</p>
        <p className="mt-1 text-xs text-muted">{t("ratesHint")}</p>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 text-sm">
          <span className="text-xs text-muted">Model</span>
          <span className="w-24 text-right text-xs text-muted">{t("in")}</span>
          <span className="w-24 text-right text-xs text-muted">{t("out")}</span>
          <span />
          <span className="font-semibold">{t("default")}</span>
          {priceInputs(c.default, (p) => set({ default: p }))}
          <span />
          {models.map((m) => {
            const p = c.models[m];
            return (
              <div key={m} className="contents">
                <span className="truncate" title={m}>
                  {m}
                </span>
                {p ? (
                  <>
                    {priceInputs(p, (x) => setModel(m, x))}
                    <button onClick={() => setModel(m, null)} className="btn btn-sm btn-ghost" title={t("useDefault")}>
                      ×
                    </button>
                  </>
                ) : (
                  <>
                    <span className="col-span-2 text-right text-xs text-muted">{t("usesDefault")}</span>
                    <button onClick={() => setModel(m, { ...c.default })} className="btn btn-sm btn-ghost">
                      {t("ownPrice")}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          {t("image")}
          <input type="number" min={0} step="any" value={c.image} onChange={(e) => set({ image: num(e.target.value) })} className="field w-24 text-right tabular-nums" />
        </label>
      </div>

      <div className={box}>
        <p className="font-semibold">{t("packagesTitle")}</p>
        <p className="mt-1 text-xs text-muted">{t("packagesHint")}</p>
        <div className="mt-3 space-y-2">
          {c.packages.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="number" min={1} step="any" value={p.credits} onChange={(e) => set({ packages: c.packages.map((x, k) => (k === i ? { ...x, credits: num(e.target.value) } : x)) })} className="field w-28 text-right tabular-nums" aria-label="credit" />
              <span className="text-muted">credit =</span>
              <input type="number" min={0} step={1000} value={p.price} onChange={(e) => set({ packages: c.packages.map((x, k) => (k === i ? { ...x, price: Math.round(num(e.target.value)) } : x)) })} className="field w-32 text-right tabular-nums" aria-label="VND" />
              <span className="text-muted">₫</span>
              <button onClick={() => set({ packages: c.packages.filter((_, k) => k !== i) })} className="btn btn-sm btn-ghost">
                {t("remove")}
              </button>
            </div>
          ))}
          <button onClick={() => set({ packages: [...c.packages, { credits: 100, price: 50000 }] })} className="btn btn-sm btn-secondary">
            {t("addPackage")}
          </button>
        </div>
        <label className="mt-4 block text-sm">
          {t("payInfo")}
          <textarea value={c.payInfo} onChange={(e) => set({ payInfo: e.target.value })} rows={3} maxLength={2000} placeholder={t("payInfoHint")} className="field mt-1 w-full" />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={state === "saving" || c.packages.some((p) => !p.credits)} className="btn btn-primary">
          {state === "saving" ? t("saving") : t("save")}
        </button>
        {state === "saved" && <span className="text-sm text-green-700 dark:text-green-400">{t("saved")}</span>}
        {state === "error" && <span className="text-sm text-red-600">{t("error")}</span>}
      </div>
    </div>
  );
}
