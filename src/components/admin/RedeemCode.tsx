"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Enter a gift code: its credits are added at once. */
export default function RedeemCode() {
  const t = useTranslations("credits");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/credits/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (r?.ok) {
      setCode("");
      setMsg({ ok: true, text: t("redeemed") });
      router.refresh();
    } else setMsg({ ok: false, text: t.has(`codeErrors.${j?.error}`) ? t(`codeErrors.${j?.error}`) : t("failed") });
  }

  return (
    <form onSubmit={redeem} className="mt-4 border-t border-line pt-4">
      <label className="text-sm font-semibold" htmlFor="gift">
        {t("giftCode")}
      </label>
      <div className="mt-1 flex gap-2">
        <input id="gift" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={40} autoComplete="off" className="field min-w-0 flex-1 font-mono" />
        <button disabled={code.trim().length < 3} className="btn btn-secondary">
          {t("redeem")}
        </button>
      </div>
      {msg && <p className={`mt-1 text-sm ${msg.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>{msg.text}</p>}
    </form>
  );
}
