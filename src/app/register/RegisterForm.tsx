"use client";

import Script from "next/script";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

const KNOWN = ["email_taken", "too_many_attempts", "signup_closed", "invalid", "captcha"];

/** `siteKey`: Cloudflare Turnstile is on (the widget puts its answer in the form field cf-turnstile-response). */
export default function RegisterForm({ bonus, siteKey }: { bonus: number; siteKey: string | null }) {
  const t = useTranslations();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget as HTMLFormElement;
    const captcha = (form.elements.namedItem("cf-turnstile-response") as HTMLInputElement | null)?.value || undefined;
    const r = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, captcha }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset(); // a token works once
    if (r?.ok) return window.location.replace("/");
    const code = (await r?.json().catch(() => ({})))?.error;
    setError(KNOWN.includes(code) ? code : "unknown");
  }
  const field = (k: keyof typeof f, type: string, auto: string) => (
    <>
      <label className="mt-4 block text-sm font-medium" htmlFor={k}>
        {t(`register.${k}`)}
      </label>
      <input id={k} type={type} autoComplete={auto} required={k !== "name"} minLength={k === "password" ? 8 : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="field mt-1 w-full text-base" />
    </>
  );

  return (
    <form onSubmit={submit}>
      <h1 className="font-serif text-3xl font-bold">{t("register.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("register.subtitle")}</p>
      {bonus > 0 && <p className="mt-3 inline-block rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">🎁 {t("register.bonus", { n: bonus })}</p>}
      {field("name", "text", "name")}
      {field("email", "email", "email")}
      {field("password", "password", "new-password")}
      <p className="mt-1 text-xs text-muted">{t("register.passwordHint")}</p>
      {siteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile mt-4" data-sitekey={siteKey} />
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {t(`register.errors.${error}`)}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary mt-6 w-full">
        {busy ? t("login.checking") : t("register.submit")}
      </button>
      <p className="mt-3 text-center text-xs text-muted">{t("register.terms")}</p>
      <p className="mt-4 text-center text-sm text-muted">
        {t("register.haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          {t("login.submit")}
        </Link>
      </p>
    </form>
  );
}
