"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";

const KNOWN_ERRORS = ["wrong_credentials", "too_many_attempts", "locked"] as const;

function Form({ signup }: { signup: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) }).catch(() => null);
    setBusy(false);
    // only paths on this site: "//host", "/\\host" and "/<tab>/host" (browsers drop tabs) would leave it
    if (r?.ok) return router.replace(/^\/(?![/\\])/.test(next) && !/[\t\n\r]/.test(next) ? next : "/");
    const code = (await r?.json().catch(() => ({})))?.error;
    setError((KNOWN_ERRORS as readonly string[]).includes(code) ? code : "unknown");
  }

  return (
    <form onSubmit={submit}>
      <h1 className="font-serif text-3xl font-bold">{t("login.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("login.subtitle")}</p>
      {sp.get("reset") === "1" && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">{t("auth.resetDone")}</p>}
      <label className="mt-6 block text-sm font-medium" htmlFor="username">
        {t("login.username")}
      </label>
      <input id="username" autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} className="field mt-1 w-full text-base" />
      <div className="mt-4 flex items-baseline justify-between">
        <label className="block text-sm font-medium" htmlFor="password">
          {t("login.password")}
        </label>
        <Link href="/forgot" className="text-sm text-accent hover:underline">
          {t("login.forgot")}
        </Link>
      </div>
      <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field mt-1 w-full text-base" />
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {t(`login.errors.${error}`)}
        </p>
      )}
      <button type="submit" disabled={busy || !username || !password} className="btn btn-primary mt-6 w-full">
        {busy ? t("login.checking") : t("login.submit")}
      </button>
      {signup && (
        <p className="mt-5 text-center text-sm text-muted">
          {t("login.noAccount")}{" "}
          <Link href="/register" className="font-semibold text-accent hover:underline">
            {t("login.register")}
          </Link>
        </p>
      )}
    </form>
  );
}

export default function LoginForm({ signup = false }: { signup?: boolean }) {
  return (
    <Suspense>
      <Form signup={signup} />
    </Suspense>
  );
}
