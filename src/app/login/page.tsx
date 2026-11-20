"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const KNOWN_ERRORS = ["wrong_password", "too_many_attempts"] as const;

function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
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
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (r.ok) return router.replace(next.startsWith("/") ? next : "/");
    const code = (await r.json().catch(() => ({}))).error;
    setError((KNOWN_ERRORS as readonly string[]).includes(code) ? code : "unknown");
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-white p-7 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold">{t("app.name")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("app.tagline")}</p>
        </div>
        <LanguageSwitcher />
      </div>
      <label className="mt-6 block text-sm font-medium" htmlFor="password">{t("login.password")}</label>
      <input
        id="password"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-accent"
      />
      {error && <p className="mt-3 text-sm text-red-700">{t(`login.errors.${error}`)}</p>}
      <button type="submit" disabled={busy || !password} className="mt-5 w-full rounded-lg bg-accent py-2 font-medium text-white disabled:opacity-50">
        {busy ? t("login.checking") : t("login.submit")}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
