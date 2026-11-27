"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Choose a new password from the link in the e-mail; then log in with it. */
export default function ResetForm({ token }: { token: string | null }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [state, setState] = useState<"" | "busy" | "bad" | "error">(token ? "" : "bad");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const r = await fetch("/api/auth/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: pw }) }).catch(() => null);
    if (r?.ok) return router.replace("/login?reset=1");
    setState(r?.status === 400 ? "bad" : "error");
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">{t("resetTitle")}</h1>
      {state === "bad" ? (
        <>
          <p className="mt-3 text-sm text-muted">{t("badLink")}</p>
          <Link href="/forgot" className="btn btn-primary mt-6 w-full">
            {t("sendLink")}
          </Link>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="mt-1 text-sm text-muted">{t("resetHint")}</p>
          <label className="mt-6 block text-sm font-medium" htmlFor="pw">
            {t("newPassword")}
          </label>
          <input id="pw" type="password" required minLength={8} autoFocus autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="field mt-1 w-full text-base" />
          <label className="mt-4 block text-sm font-medium" htmlFor="pw2">
            {t("repeatPassword")}
          </label>
          <input id="pw2" type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="field mt-1 w-full text-base" />
          {pw2 && pw !== pw2 && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{t("mismatch")}</p>}
          {state === "error" && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {t("failed")}
            </p>
          )}
          <button disabled={state === "busy" || pw.length < 8 || pw !== pw2} className="btn btn-primary mt-6 w-full">
            {state === "busy" ? t("saving") : t("savePassword")}
          </button>
        </form>
      )}
    </div>
  );
}
