"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Ask for a reset link by e-mail; the answer is the same whether or not the e-mail has an account. */
export default function ForgotForm({ mail }: { mail: boolean }) {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"" | "busy" | "sent" | "limit" | "error">("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    setState(r?.ok ? "sent" : r?.status === 429 ? "limit" : "error");
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">{t("forgotTitle")}</h1>
      {!mail ? (
        <p className="mt-3 text-sm text-muted">{t("noMail")}</p>
      ) : state === "sent" ? (
        <div className="mt-4 rounded-xl bg-accent/10 p-4 text-sm">
          <p className="font-semibold">{t("sentTitle")}</p>
          <p className="mt-1 text-muted">{t("sentBody", { email })}</p>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p className="mt-1 text-sm text-muted">{t("forgotHint")}</p>
          <label className="mt-6 block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1 w-full text-base" />
          {(state === "limit" || state === "error") && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {t(state === "limit" ? "tooMany" : "failed")}
            </p>
          )}
          <button disabled={state === "busy" || !email} className="btn btn-primary mt-6 w-full">
            {state === "busy" ? t("sending") : t("sendLink")}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-accent hover:underline">
          ← {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}
