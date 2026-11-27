"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Cancel one's own waiting top-up request. */
export default function CancelTopup({ id, code }: { id: number; code: string }) {
  const t = useTranslations("credits");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault(); // inside a <summary>: do not open the QR
        if (!confirm(t("cancelConfirm", { code }))) return;
        setBusy(true);
        await fetch(`/api/credits/topup/${id}`, { method: "DELETE" }).catch(() => null);
        setBusy(false);
        router.refresh();
      }}
      className="btn btn-sm btn-ghost text-red-600 dark:text-red-400"
    >
      {t("cancel")}
    </button>
  );
}
