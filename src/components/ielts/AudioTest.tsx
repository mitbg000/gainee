"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import * as I from "@/components/icons";

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

/** Delete a recording (with its file); Listening parts that played it are left without audio. */
export function DeleteAudio({ id, name }: { id: number; name: string }) {
  const t = useTranslations("ielts.book");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        if (!confirm(t("deleteAudioConfirm", { name }))) return;
        setBusy(true);
        await fetch(`/api/ielts/audio/${id}`, { method: "DELETE" });
        router.refresh();
      }}
      disabled={busy}
      className="icon-btn text-red-600 dark:text-red-400"
      title={t("deleteAudio")}
      aria-label={t("deleteAudio")}
    >
      <I.IconTrash className="h-4 w-4" />
    </button>
  );
}
