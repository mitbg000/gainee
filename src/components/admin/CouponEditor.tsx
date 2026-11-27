"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Row = { id: number; code: string; kind: "gift" | "discount"; credits: number; percent: number; amount: number; maxUses: number | null; used: number; expiresAt: string | null; active: boolean; note: string | null };
const json = (method: string, body?: unknown) => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

/** Gift codes (credits at once) and discount codes (cheaper top-up packages). */
export default function CouponEditor({ rows }: { rows: Row[] }) {
  const t = useTranslations("admin.coupons");
  const router = useRouter();
  const [f, setF] = useState({ code: randomCode(), kind: "gift" as Row["kind"], credits: 50, percent: 10, amount: 0, maxUses: "", expiresAt: "", note: "" });
  const [msg, setMsg] = useState("");

  async function create() {
    setMsg("");
    const body = { ...f, maxUses: f.maxUses ? Number(f.maxUses) : null, expiresAt: f.expiresAt ? new Date(`${f.expiresAt}T23:59:59`).toISOString() : null };
    const r = await fetch("/api/admin/coupons", json("POST", body)).catch(() => null);
    if (!r?.ok) return setMsg(t(r?.status === 409 ? "duplicate" : "invalid"));
    setF({ ...f, code: randomCode() });
    router.refresh();
  }
  const toggle = async (r: Row) => {
    await fetch(`/api/admin/coupons/${r.id}`, json("PATCH", { active: !r.active }));
    router.refresh();
  };
  const remove = async (r: Row) => {
    if (!confirm(t("deleteConfirm", { code: r.code }))) return;
    await fetch(`/api/admin/coupons/${r.id}`, json("DELETE"));
    router.refresh();
  };
  const what = (r: Row) => (r.kind === "gift" ? t("giftOf", { n: r.credits }) : [r.percent ? `−${r.percent}%` : "", r.amount ? `−${r.amount.toLocaleString()} ₫` : ""].filter(Boolean).join(" "));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-card p-4">
        <p className="font-semibold">{t("new")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            {t("code")}
            <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} maxLength={40} className="field mt-1 w-full font-mono" />
          </label>
          <label className="text-sm">
            {t("kind")}
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Row["kind"] })} className="field mt-1 w-full">
              <option value="gift">{t("gift")}</option>
              <option value="discount">{t("discount")}</option>
            </select>
          </label>
          {f.kind === "gift" ? (
            <label className="text-sm">
              {t("credits")}
              <input type="number" min={1} value={f.credits} onChange={(e) => setF({ ...f, credits: Number(e.target.value) })} className="field mt-1 w-full" />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                %
                <input type="number" min={0} max={100} value={f.percent} onChange={(e) => setF({ ...f, percent: Number(e.target.value) })} className="field mt-1 w-full" />
              </label>
              <label className="text-sm">
                ₫
                <input type="number" min={0} step={1000} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} className="field mt-1 w-full" />
              </label>
            </div>
          )}
          <label className="text-sm">
            {t("maxUses")}
            <input type="number" min={1} value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} placeholder={t("unlimited")} className="field mt-1 w-full" />
          </label>
          <label className="text-sm">
            {t("expires")}
            <input type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} className="field mt-1 w-full" />
          </label>
          <label className="text-sm sm:col-span-2 lg:col-span-3">
            {t("note")}
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={255} className="field mt-1 w-full" />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={create} disabled={f.code.length < 3} className="btn btn-primary">
            {t("create")}
          </button>
          <span className="text-xs text-muted">{t("oncePerUser")}</span>
          {msg && <span className="text-sm text-red-600">{msg}</span>}
        </div>
      </div>

      {rows.length ? (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card text-sm">
          {rows.map((r) => {
            const over = (r.expiresAt && new Date(r.expiresAt) < new Date()) || (r.maxUses != null && r.used >= r.maxUses);
            return (
              <li key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${!r.active || over ? "opacity-60" : ""}`}>
                <span className="font-mono font-semibold">{r.code}</span>
                <span className={`chip ${r.kind === "gift" ? "chip-on" : ""}`}>{t(r.kind)}</span>
                <span>{what(r)}</span>
                <span className="text-muted">
                  {t("usedOf", { n: r.used, max: r.maxUses ?? "∞" })}
                  {r.expiresAt && ` · ${t("until", { date: new Date(r.expiresAt).toLocaleDateString() })}`}
                  {r.note && ` · ${r.note}`}
                </span>
                <span className="ml-auto flex gap-1">
                  <button onClick={() => toggle(r)} className="btn btn-sm btn-ghost">
                    {r.active ? t("pause") : t("resume")}
                  </button>
                  <button onClick={() => remove(r)} className="btn btn-sm btn-ghost text-red-600">
                    {t("delete")}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("none")}</p>
      )}
    </div>
  );
}
