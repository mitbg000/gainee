"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * The account's e-mail, with Change (or Add, when the account only has a user name); the current password confirms it.
 * Not a <form>: it sits inside the profile form.
 */
export default function EmailChange({ email }: { email: string }) {
  const t = useTranslations("profile.email");
  const router = useRouter();
  const has = email.includes("@");
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ email: has ? email : "", password: "" });
  const [state, setState] = useState<"" | "saving" | "saved" | string>("");

  async function save() {
    setState("saving");
    const r = await fetch("/api/settings/email", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(v) }).catch(() => null);
    if (r?.ok) {
      setState("saved");
      setOpen(false);
      setV({ ...v, password: "" });
      return router.refresh();
    }
    const e = ((await r?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
    setState(e && ["wrong_password", "email_taken", "too_many_attempts", "invalid"].includes(e) ? e : "failed");
  }
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault(); // do not submit the profile form around it
      save();
    }
  };

  return (
    <div>
      <p className="mb-1 block text-sm font-medium">Email</p>
      {!open ? (
        <div className="flex min-h-10 flex-wrap items-center gap-2 text-sm">
          <span className={has ? "" : "text-muted"}>{has ? email : t("none", { login: email })}</span>
          <button type="button" onClick={() => setOpen(true)} className="text-accent hover:underline">
            {has ? t("change") : t("add")}
          </button>
          {state === "saved" && <span className="text-green-700 dark:text-green-400">{t("saved")}</span>}
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} onKeyDown={enter} placeholder={t("newEmail")} autoComplete="email" className="field w-full" aria-label={t("newEmail")} />
          <input type="password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} onKeyDown={enter} placeholder={t("password")} autoComplete="current-password" className="field w-full" aria-label={t("password")} />
          <p className="text-xs text-muted">{t("hint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={state === "saving" || !v.email.includes("@") || !v.password} className="btn btn-sm btn-primary">
              {state === "saving" ? t("saving") : t("save")}
            </button>
            <button type="button" onClick={() => { setOpen(false); setState(""); }} className="btn btn-sm btn-ghost">
              {t("cancel")}
            </button>
            {state && !["saving", "saved"].includes(state) && <span className="text-sm text-red-600">{t(`errors.${state}`)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
