"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { fmtCredits } from "@/lib/fmtCredits";

type U = { id: number; name: string; role: "student" | "editor" | "admin"; disabled: boolean; credits: number; features: Record<string, boolean> | null };
const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** One account: role, which AI features it may use, lock, new password, credits by hand. */
export default function UserEditor({ user, effective, self }: { user: U; effective: Record<string, boolean>; self: boolean }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [u, setU] = useState(user);
  const [feat, setFeat] = useState(effective);
  const [password, setPassword] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  async function send(url: string, init: RequestInit, ok: string) {
    setMsg("");
    const r = await fetch(url, init).catch(() => null);
    const e = r?.ok ? null : ((await r?.json().catch(() => ({})))?.error ?? "network");
    setMsg(e ? t("saveError", { error: e }) : ok);
    if (!e) router.refresh();
    return !e;
  }
  const save = () => send(`/api/admin/users/${u.id}`, json("PATCH", { name: u.name, role: u.role, disabled: u.disabled, features: feat, ...(password ? { password } : {}) }), t("saved")).then((ok) => ok && setPassword(""));
  const give = async () => {
    const n = Number(amount);
    if (!n) return;
    if (await send(`/api/admin/users/${u.id}/credits`, json("POST", { amount: n, note }), t("creditsDone"))) {
      setAmount("");
      setNote("");
    }
  };

  const box = "rounded-2xl border border-line bg-card p-4";
  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <div className={box}>
        <label className="block text-sm">
          {t("name")}
          <input value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} maxLength={100} className="field mt-1 w-full" />
        </label>
        <label className="mt-3 block text-sm">
          {t("role")}
          <select value={u.role} disabled={self} onChange={(e) => setU({ ...u, role: e.target.value as U["role"] })} className="field mt-1 w-full">
            {(["student", "editor", "admin"] as const).map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-xs text-muted">{t(`roleHint.${u.role}`)}</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={u.disabled} disabled={self} onChange={(e) => setU({ ...u, disabled: e.target.checked })} />
          {t("lock")}
        </label>
        <label className="mt-3 block text-sm">
          {t("newPassword")}
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} placeholder={t("newPasswordHint")} className="field mt-1 w-full" />
        </label>
      </div>

      <div className={box}>
        <p className="text-sm font-semibold">{t("features")}</p>
        <p className="text-xs text-muted">{t("featuresHint")}</p>
        <div className="mt-2 space-y-1.5">
          {Object.keys(feat).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={feat[k]} onChange={(e) => setFeat({ ...feat, [k]: e.target.checked })} />
              {t(`feature.${k}`)}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button onClick={save} disabled={!!password && password.length < 8} className="btn btn-primary">
          {t("save")}
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>

      <div className={`${box} md:col-span-2`}>
        <p className="text-sm">
          {t("balance")}: <span className="font-serif text-2xl font-bold tabular-nums">{u.role === "admin" ? "∞" : fmtCredits(user.credits)}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("amountHint")} className="field w-36 text-right tabular-nums" aria-label={t("amount")} />
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder={t("note")} className="field min-w-0 flex-1" />
          <button onClick={give} disabled={!Number(amount)} className="btn btn-secondary">
            {t("giveCredits")}
          </button>
        </div>
      </div>
    </div>
  );
}
