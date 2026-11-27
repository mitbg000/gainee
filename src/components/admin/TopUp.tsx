"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import PayPanel, { type Pay } from "./PayPanel";

type Pack = { credits: number; price: number; save: number };
// one row on wide screens when it fits (class names written out for Tailwind)
const COLS: Record<number, string> = { 1: "sm:grid-cols-2", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" };
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} ₫`;
const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/**
 * Top up in one flow: pick a package or "other amount", see what you get and pay, an optional discount code,
 * one button; the bank transfer QR then takes the place of the form.
 */
export default function TopUp({ packages, custom, payInfo }: { packages: Pack[]; custom: { min: number; perCredit: number } | null; payInfo: string }) {
  const t = useTranslations("credits");
  const router = useRouter();
  const best = packages.reduce((b, p, i) => (p.save > (packages[b]?.save ?? -1) ? i : b), 0);
  const [pick, setPick] = useState<number>(packages.length ? Math.min(1, packages.length - 1) : -1); // -1: other amount
  const [amount, setAmount] = useState(custom ? String(custom.min) : "");
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState<{ price: number; credits: number; discount: number } | null>(null); // with the code
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ id: number; code: string; price: number; pay: Pay | null; paid: boolean } | null>(null);

  const amountN = Math.round(Number(amount) || 0);
  const tooLow = pick === -1 && !!custom && amountN < custom.min;
  const which = pick === -1 ? { amount: amountN } : { index: pick };
  const base = pick === -1 ? { credits: custom ? Math.floor((amountN / custom.perCredit) * 100) / 100 : 0, price: amountN } : packages[pick];
  const shown = quote ?? { ...base, discount: 0 };

  // a code in use: ask the price again when the choice changes
  const codeKey = JSON.stringify(which);
  useEffect(() => {
    setQuote(null);
  }, [codeKey]);
  const message = (e?: string) =>
    e === "too_many_pending" ? t("tooMany") : e === "below_min" && custom ? t("belowMin", { min: vnd(custom.min) }) : e && t.has(`codeErrors.${e}`) ? t(`codeErrors.${e}`) : t("failed");

  async function apply() {
    setError("");
    const r = await fetch("/api/credits/topup", json({ ...which, code, preview: true })).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) return setError(message(j?.error));
    setQuote(j);
  }
  async function pay() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/credits/topup", json({ ...which, code: quote && code ? code : undefined })).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) return setError(message(j?.error));
    setDone({ id: j.id, code: j.code, price: j.price, pay: j.pay ?? null, paid: !!j.done });
    router.refresh();
  }

  if (done)
    return (
      <div>
        {done.paid ? (
          <p className="rounded-xl bg-green-50 p-4 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">{t("freeDone")}</p>
        ) : done.pay ? (
          <PayPanel id={done.id} code={done.code} price={vnd(done.price)} pay={done.pay} />
        ) : (
          <div className="rounded-xl bg-accent/10 p-4 text-sm">
            <p>{t("asked", { code: done.code })}</p>
            {payInfo && <p className="mt-2 whitespace-pre-line">{payInfo}</p>}
          </div>
        )}
        <button onClick={() => setDone(null)} className="btn btn-sm btn-ghost mt-3">
          ← {t("again")}
        </button>
      </div>
    );

  const tile = (active: boolean) => `relative flex flex-col items-start rounded-xl border-2 p-3 text-left transition-colors ${active ? "border-accent bg-accent/5" : "border-line hover:border-accent/50"}`;
  return (
    <div>
      <div role="radiogroup" aria-label={t("topup")} className={`grid grid-cols-2 gap-2 ${COLS[Math.min(5, packages.length + (custom ? 1 : 0))] ?? "sm:grid-cols-3"}`}>
        {packages.map((p, i) => (
          <button key={i} type="button" role="radio" aria-checked={pick === i} onClick={() => setPick(i)} className={tile(pick === i)}>
            {i === best && p.save > 0 && <span className="absolute -top-2.5 right-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-on-accent">{t("best")}</span>}
            <span className="font-serif text-2xl font-bold tabular-nums">{p.credits.toLocaleString()}</span>
            <span className="text-xs text-muted">credit</span>
            <span className="mt-2 text-sm font-semibold">{vnd(p.price)}</span>
            {p.save >= 1 && <span className="text-xs font-medium text-green-700 dark:text-green-400">{t("save", { n: p.save })}</span>}
          </button>
        ))}
        {custom && (
          <button type="button" role="radio" aria-checked={pick === -1} onClick={() => setPick(-1)} className={tile(pick === -1)}>
            <span className="font-serif text-2xl font-bold">…</span>
            <span className="text-xs text-muted">{t("otherAmount")}</span>
            <span className="mt-2 text-sm text-muted">{t("fromMin", { min: vnd(custom.min) })}</span>
          </button>
        )}
      </div>

      {pick === -1 && custom && (
        <div className="mt-3">
          <label htmlFor="amount" className="text-sm font-medium">
            {t("customTitle")}
          </label>
          <div className="relative mt-1 max-w-xs">
            <input id="amount" type="number" inputMode="numeric" min={custom.min} step={10000} value={amount} onChange={(e) => setAmount(e.target.value)} className="field w-full pr-8 text-right tabular-nums" aria-describedby="amount-help" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">₫</span>
          </div>
          <p id="amount-help" className={`mt-1 text-xs ${tooLow ? "text-red-600 dark:text-red-400" : "text-muted"}`}>
            {t("customHelp", { min: vnd(custom.min), rate: vnd(custom.perCredit) })}
          </p>
        </div>
      )}

      {/* what you get, what you pay */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-paper px-4 py-3">
        <div className="text-sm">
          <span className="text-muted">{t("youGet")}</span> <span className="font-semibold tabular-nums">{shown.credits.toLocaleString()} credit</span>
        </div>
        <div className="text-sm">
          <span className="text-muted">{t("youPay")}</span>{" "}
          {shown.discount > 0 && <s className="mr-1 text-muted">{vnd(shown.price + shown.discount)}</s>}
          <span className="font-semibold tabular-nums">{vnd(shown.price)}</span>
        </div>
        <button onClick={pay} disabled={busy || tooLow || !shown.credits} className="btn btn-primary ml-auto">
          {busy ? t("sending") : t("payNow")}
        </button>
      </div>

      <div className="mt-2 text-sm">
        {showCode ? (
          <div className="flex max-w-sm gap-2">
            <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setQuote(null); }} maxLength={40} placeholder={t("discountCode")} autoComplete="off" autoFocus className="field-sm min-w-0 flex-1 font-mono" aria-label={t("discountCode")} />
            <button onClick={apply} disabled={code.trim().length < 3} className="btn btn-sm btn-secondary">
              {t("apply")}
            </button>
          </div>
        ) : (
          <button onClick={() => setShowCode(true)} className="text-accent hover:underline">
            {t("haveDiscount")}
          </button>
        )}
        {quote && quote.discount > 0 && <p className="mt-1 text-xs text-green-700 dark:text-green-400">{t("applied")}</p>}
        {error && (
          <p role="alert" className="mt-1 text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
