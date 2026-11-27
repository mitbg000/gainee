"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export type Pay = { qr: string; bank: string; account: string; holder: string };

/** Bank transfer for one top-up request: the VietQR picture, the details to copy, and a check every few seconds until SePay reports it. */
export default function PayPanel({ id, code, price, pay }: { id: number; code: string; price: string; pay: Pay }) {
  const t = useTranslations("credits.pay");
  const router = useRouter();
  const [status, setStatus] = useState("pending");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (status !== "pending") return;
    const timer = setInterval(async () => {
      const r = await fetch(`/api/credits/topup/${id}`, { cache: "no-store" }).catch(() => null);
      const s = r?.ok ? (await r.json()).status : null;
      if (s && s !== "pending") {
        setStatus(s);
        router.refresh();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [id, status, router]);

  const copy = (v: string) => {
    navigator.clipboard?.writeText(v).then(() => {
      setCopied(v);
      setTimeout(() => setCopied(""), 1500);
    });
  };
  const row = (label: string, value: string, mono = false) => (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
      <span className="text-muted">{label}</span>
      <button type="button" onClick={() => copy(value)} className={`truncate text-right font-semibold hover:text-accent ${mono ? "font-mono" : ""}`} title={t("copy")}>
        {copied === value ? t("copied") : value}
      </button>
    </div>
  );

  if (status === "done")
    return (
      <div className="mt-3 rounded-xl bg-green-50 p-4 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
        <p className="font-semibold">{t("paidTitle")}</p>
        <p className="mt-1">{t("paidText", { code })}</p>
      </div>
    );
  return (
    <div className="mt-3 grid gap-4 rounded-xl border border-line bg-paper p-4 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pay.qr} alt={t("qrAlt", { code })} width={192} height={192} className="mx-auto w-48 rounded-lg bg-white" />
      <div>
        <p className="font-semibold">{t("title")}</p>
        <p className="mt-0.5 text-xs text-muted">{t("hint")}</p>
        <div className="mt-2">
          {row(t("bank"), pay.bank)}
          {row(t("account"), pay.account, true)}
          {pay.holder && row(t("holder"), pay.holder)}
          {row(t("amount"), price)}
          {row(t("content"), code, true)}
        </div>
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          <span className="size-2 animate-pulse rounded-full bg-accent" /> {t("waiting")}
        </p>
      </div>
    </div>
  );
}
