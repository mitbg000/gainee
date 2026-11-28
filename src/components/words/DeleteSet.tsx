"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as I from "@/components/icons";
import { ask } from "@/components/Toaster";

/** Delete one of your sets; its words stay in the notebook. */
export default function DeleteSet({ id, title }: { id: number; title: string }) {
  const t = useTranslations("notebook");
  const router = useRouter();
  async function remove() {
    if (!(await ask(t("deleteConfirm", { title }), { danger: true }))) return;
    await fetch(`/api/sets/${id}`, { method: "DELETE" });
    router.push("/words");
    router.refresh();
  }
  return (
    <button onClick={remove} className="icon-btn text-red-600 dark:text-red-400" aria-label={t("deleteSet")} title={t("deleteSet")}>
      <I.IconTrash />
    </button>
  );
}
