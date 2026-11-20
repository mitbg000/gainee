"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import type { Theme } from "@/theme/config";

const KNOWN_ERRORS = ["wrong_credentials", "too_many_attempts"] as const;

function Form({ theme }: { theme: Theme }) {
  const t = useTranslations();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setBusy(false);
    if (r.ok) return router.replace(next.startsWith("/") ? next : "/");
    const code = (await r.json().catch(() => ({}))).error;
    setError((KNOWN_ERRORS as readonly string[]).includes(code) ? code : "unknown");
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-card p-7 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold">{t("app.name")}</h1>
          <p className="mt-1 text-sm text-muted">{t("app.tagline")}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <LanguageSwitcher />
          <ThemeSwitcher initial={theme} />
        </div>
      </div>
      <label className="mt-6 block text-sm font-medium" htmlFor="username">{t("login.username")}</label>
      <input
        id="username"
        autoFocus
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2.5 text-base outline-none focus:border-accent"
      />
      <label className="mt-4 block text-sm font-medium" htmlFor="password">{t("login.password")}</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-base outline-none focus:border-accent"
      />
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{t(`login.errors.${error}`)}</p>}
      <button type="submit" disabled={busy || !username || !password} className="mt-5 min-h-11 w-full rounded-xl bg-accent py-2.5 font-medium text-on-accent disabled:opacity-50">
        {busy ? t("login.checking") : t("login.submit")}
      </button>
    </form>
  );
}

export default function LoginForm({ theme }: { theme: Theme }) {
  return (
    <Suspense>
      <Form theme={theme} />
    </Suspense>
  );
}
