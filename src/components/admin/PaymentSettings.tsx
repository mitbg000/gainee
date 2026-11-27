"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type C = { enabled: boolean; bank: string; account: string; holder: string; prefix: string; expireHours: number };

/** SePay: the bank account learners pay to, and the webhook secret SePay signs its calls with. */
export default function PaymentSettings({ initial, hasApiKey, hasHmac, webhookUrl }: { initial: C; hasApiKey: boolean; hasHmac: boolean; webhookUrl: string }) {
  const t = useTranslations("admin.payments");
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [hmac, setHmac] = useState("");
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  const set = (p: Partial<C>) => {
    setC({ ...c, ...p });
    setState("");
  };

  async function save(extra: Record<string, unknown> = {}) {
    setState("saving");
    const r = await fetch("/api/admin/payments", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...c, apiKey, hmac, ...extra }) }).catch(() => null);
    setState(r?.ok ? "saved" : "error");
    if (r?.ok) {
      setApiKey("");
      setHmac("");
      router.refresh();
    }
  }
  const field = (k: keyof C, label: string, ph: string) => (
    <label className="block text-sm">
      {label}
      <input value={c[k] as string} onChange={(e) => set({ [k]: e.target.value } as Partial<C>)} placeholder={ph} className="field mt-1 w-full" />
    </label>
  );
  const badPrefix = !/^[A-Z]{2,5}$/.test(c.prefix);
  const missing = c.enabled && (!c.bank || !c.account || (!hasApiKey && !hasHmac && !apiKey && !hmac));

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="font-semibold">{t("title")}</p>
      <p className="mt-1 text-xs text-muted">{t("hint")}</p>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={c.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        {t("enabled")}
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {field("bank", t("bank"), "MBBank, VCB, 970422…")}
        {field("account", t("account"), "0123456789")}
        {field("holder", t("holder"), "NGUYEN VAN A")}
        <label className="block text-sm">
          {t("prefix")}
          <input
            value={c.prefix}
            onChange={(e) => set({ prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) })}
            placeholder="GN"
            className={`field mt-1 w-full font-mono ${badPrefix ? "border-red-500" : ""}`}
            aria-invalid={badPrefix}
          />
          <span className={`mt-1 block text-xs ${badPrefix ? "text-red-600" : "text-muted"}`}>{badPrefix ? t("prefixBad") : t("prefixExample", { code: `${c.prefix || "GN"}K7Q2M9XA` })}</span>
        </label>
        <label className="block text-sm">
          {t("expireHours")}
          <input type="number" min={0} max={720} value={c.expireHours} onChange={(e) => set({ expireHours: Math.max(0, Math.min(720, Math.round(Number(e.target.value) || 0))) })} className="field mt-1 w-full tabular-nums" />
          <span className="mt-1 block text-xs text-muted">{t("expireHint")}</span>
        </label>
      </div>

      <div className="mt-4 rounded-xl bg-paper p-3 text-sm">
        <p className="font-semibold">{t("setupTitle")}</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted">
          <li>{t("step1")}</li>
          <li>
            {t("step2")} <code className="break-all rounded bg-card px-1.5 py-0.5 text-ink">{webhookUrl}</code>
          </li>
          <li>{t("step3")}</li>
          <li>{t("step4", { prefix: c.prefix || "GN" })}</li>
        </ol>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          API Key
          <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hasApiKey ? t("kept") : t("apiKeyHint")} className="field mt-1 w-full font-mono" />
          {hasApiKey && (
            <button type="button" onClick={() => save({ apiKey: null })} className="mt-1 text-xs text-red-600 hover:underline">
              {t("remove")}
            </button>
          )}
        </label>
        <label className="block text-sm">
          HMAC secret ({t("recommended")})
          <input type="password" autoComplete="off" value={hmac} onChange={(e) => setHmac(e.target.value)} placeholder={hasHmac ? t("kept") : t("hmacHint")} className="field mt-1 w-full font-mono" />
          {hasHmac && (
            <button type="button" onClick={() => save({ hmac: null })} className="mt-1 text-xs text-red-600 hover:underline">
              {t("remove")}
            </button>
          )}
        </label>
      </div>
      {missing && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t("missing")}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button onClick={() => save()} disabled={state === "saving" || badPrefix} className="btn btn-primary">
          {state === "saving" ? t("saving") : t("save")}
        </button>
        {state === "saved" && <span className="text-sm text-green-700 dark:text-green-400">{t("saved")}</span>}
        {state === "error" && <span className="text-sm text-red-600">{t("error")}</span>}
      </div>
    </div>
  );
}
