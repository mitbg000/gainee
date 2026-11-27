"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import type { Theme } from "@/theme/config";

const KNOWN = ["email_taken", "too_many_attempts", "signup_closed", "invalid"];

export default function RegisterForm({ theme, bonus }: { theme: Theme; bonus: number }) {
  const t = useTranslations();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    setBusy(false);
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
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-card p-7 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold">{t("register.title")}</h1>
          <p className="mt-1 text-sm text-muted">{bonus > 0 ? t("register.bonus", { n: bonus }) : t("app.tagline")}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <LanguageSwitcher />
          <ThemeSwitcher initial={theme} />
        </div>
      </div>
      {field("name", "text", "name")}
      {field("email", "email", "email")}
      {field("password", "password", "new-password")}
      <p className="mt-1 text-xs text-muted">{t("register.passwordHint")}</p>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{t(`register.errors.${error}`)}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary mt-5 w-full">
        {busy ? t("login.checking") : t("register.submit")}
      </button>
      <p className="mt-4 text-center text-sm text-muted">
        {t("register.haveAccount")}{" "}
        <a href="/login" className="font-semibold text-accent underline">
          {t("login.submit")}
        </a>
      </p>
    </form>
  );
}
