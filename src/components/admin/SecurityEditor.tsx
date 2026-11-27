"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type C = { aiPerMinute: number; aiCreditsPerDay: number; maxInputChars: number; maxOutputTokens: number; captcha: boolean; turnstileSiteKey: string };

/** AI limits for learners and Cloudflare Turnstile on sign-up. */
export default function SecurityEditor({ initial, hasSecret }: { initial: C; hasSecret: boolean }) {
  const t = useTranslations("admin.security");
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [secret, setSecret] = useState("");
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  const set = (p: Partial<C>) => {
    setC({ ...c, ...p });
    setState("");
  };
  const n = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  async function save() {
    setState("saving");
    const r = await fetch("/api/admin/security", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...c, turnstileSecret: secret || undefined }) }).catch(() => null);
    setState(r?.ok ? "saved" : "error");
    if (r?.ok) {
      setSecret("");
      router.refresh();
    }
  }

  const box = "rounded-2xl border border-line bg-card p-4";
  const num = (k: keyof C, label: string) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input type="number" min={0} value={c[k] as number} onChange={(e) => set({ [k]: n(e.target.value) } as Partial<C>)} className="field w-32 text-right tabular-nums" />
    </label>
  );
  const needKeys = c.captcha && (!c.turnstileSiteKey || (!hasSecret && !secret));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={box}>
        <p className="font-semibold">{t("aiTitle")}</p>
        <p className="mb-3 text-xs text-muted">{t("aiHint")}</p>
        <div className="space-y-2">
          {num("aiPerMinute", t("perMinute"))}
          {num("aiCreditsPerDay", t("perDay"))}
          {num("maxInputChars", t("maxInput"))}
          {num("maxOutputTokens", t("maxOutput"))}
        </div>
      </div>
      <div className={box}>
        <p className="font-semibold">{t("captchaTitle")}</p>
        <p className="mb-3 text-xs text-muted">{t("captchaHint")}</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={c.captcha} onChange={(e) => set({ captcha: e.target.checked })} />
          {t("captchaOn")}
        </label>
        <label className="mt-3 block text-sm">
          Site key
          <input value={c.turnstileSiteKey} onChange={(e) => set({ turnstileSiteKey: e.target.value.trim() })} className="field mt-1 w-full font-mono" maxLength={200} />
        </label>
        <label className="mt-3 block text-sm">
          Secret key
          <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={hasSecret ? t("secretKept") : ""} className="field mt-1 w-full font-mono" maxLength={200} />
        </label>
        {needKeys && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t("needKeys")}</p>}
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <button onClick={save} disabled={state === "saving"} className="btn btn-primary">
          {state === "saving" ? t("saving") : t("save")}
        </button>
        {state === "saved" && <span className="text-sm text-green-700 dark:text-green-400">{t("saved")}</span>}
        {state === "error" && <span className="text-sm text-red-600">{t("error")}</span>}
      </div>
    </div>
  );
}
