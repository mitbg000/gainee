"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export default function TopupActions({ id }: { id: number }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const settle = async (approve: boolean) => {
    if (!confirm(approve ? t("approveConfirm", { code: `GN${id}` }) : t("rejectConfirm"))) return;
    setBusy(true);
    await fetch(`/api/admin/topups/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approve }) }).catch(() => null);
    setBusy(false);
    router.refresh();
  };
  return (
    <span className="flex gap-2">
      <button disabled={busy} onClick={() => settle(true)} className="btn btn-sm btn-primary">
        {t("approve")}
      </button>
      <button disabled={busy} onClick={() => settle(false)} className="btn btn-sm btn-ghost">
        {t("reject")}
      </button>
    </span>
  );
}
