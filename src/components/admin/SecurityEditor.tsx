"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type C = {
  aiPerMinute: number;
  aiCreditsPerDay: number;
  maxInputChars: number;
  maxOutputTokens: number;
  captcha: boolean;
  turnstileSiteKey: string;
  siteUrl: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  mailFrom: string;
};

/** AI limits for learners and Cloudflare Turnstile on sign-up. */
export default function SecurityEditor({ initial, hasSecret, hasSmtpPass }: { initial: C; hasSecret: boolean; hasSmtpPass: boolean }) {
  const t = useTranslations("admin.security");
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [secret, setSecret] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [test, setTest] = useState("");
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  const set = (p: Partial<C>) => {
    setC({ ...c, ...p });
    setState("");
  };
  const n = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  async function save() {
    setState("saving");
    const r = await fetch("/api/admin/security", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...c, turnstileSecret: secret || undefined, smtpPass: smtpPass || undefined }) }).catch(() => null);
    setState(r?.ok ? "saved" : "error");
    if (r?.ok) {
      setSecret("");
      setSmtpPass("");
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
  async function sendTest() {
    setTest(t("testing"));
    const r = await fetch("/api/admin/security/test-mail", { method: "POST" }).catch(() => null);
    setTest(r?.ok ? t("testSent") : t("testFailed", { error: (await r?.json().catch(() => ({})))?.error ?? "network" }));
  }
  const text = (k: keyof C, label: string, ph = "", type = "text") => (
    <label className="block text-sm">
      {label}
      <input type={type} value={c[k] as string} onChange={(e) => set({ [k]: e.target.value } as Partial<C>)} placeholder={ph} className="field mt-1 w-full" maxLength={200} />
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
      <div className={`${box} md:col-span-2`}>
        <p className="font-semibold">{t("mailTitle")}</p>
        <p className="mb-3 text-xs text-muted">{t("mailHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {text("siteUrl", t("siteUrl"), "https://gainee.example.com", "url")}
          {text("mailFrom", t("mailFrom"), "Gainee <no-reply@example.com>")}
          {text("smtpHost", "SMTP host", "smtp.gmail.com")}
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <label className="block text-sm">
              Port
              <input type="number" min={1} max={65535} value={c.smtpPort} onChange={(e) => set({ smtpPort: n(e.target.value) || 587 })} className="field mt-1 w-full" />
            </label>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={c.smtpSecure} onChange={(e) => set({ smtpSecure: e.target.checked })} />
              SSL/TLS
            </label>
          </div>
          {text("smtpUser", t("smtpUser"))}
          <label className="block text-sm">
            {t("smtpPass")}
            <input type="password" autoComplete="off" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder={hasSmtpPass ? t("secretKept") : ""} className="field mt-1 w-full" maxLength={200} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={sendTest} className="btn btn-sm btn-secondary">
            {t("testMail")}
          </button>
          {test && <span className="text-sm text-muted">{test}</span>}
        </div>
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
