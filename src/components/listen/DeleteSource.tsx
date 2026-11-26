"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as I from "@/components/icons";

export default function DeleteSource({ id, title }: { id: number; title: string }) {
  const t = useTranslations("listen");
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        if (!confirm(t("deleteConfirm", { title }))) return;
        await fetch(`/api/listen/sources/${id}`, { method: "DELETE" });
        router.refresh();
      }}
      className="icon-btn"
      aria-label={t("delete")}
    >
      <I.IconTrash />
    </button>
  );
}
