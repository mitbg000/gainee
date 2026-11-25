"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Which test a recording belongs to: its Listening parts get the file (with part marks) as soon as one is chosen. */
export default function AudioTest({ id, value, tests }: { id: number; value: number | null; tests: { id: number; title: string }[] }) {
  const t = useTranslations("ielts.book");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <select
      value={value ?? ""}
      disabled={busy}
      onChange={async (e) => {
        setBusy(true);
        await fetch(`/api/ielts/audio/${id}/assign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ testId: e.target.value ? Number(e.target.value) : null }) });
        setBusy(false);
        router.refresh();
      }}
      aria-label={t("audioFor")}
      className={`field field-sm ${value ? "" : "border-amber-400"}`}
    >
      <option value="">{t("audioNone")}</option>
      {tests.map((x) => (
        <option key={x.id} value={x.id}>
          {x.title}
        </option>
      ))}
    </select>
  );
}
