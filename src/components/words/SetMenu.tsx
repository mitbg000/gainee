"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import ExportWords, { type ExportGroup } from "@/components/ExportWords";
import * as I from "@/components/icons";
import { ask } from "@/components/Toaster";

/** The set's ⋯ menu: edit (own sets, reading texts), export, delete (own sets). */
export default function SetMenu({ editHref, setId, title, groups }: { editHref?: string; setId?: number; title: string; groups: ExportGroup[] }) {
  const t = useTranslations("notebook");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // closes on a click elsewhere or Escape
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function remove() {
    setOpen(false);
    if (!setId || !(await ask(t("deleteConfirm", { title }), { danger: true }))) return;
    await fetch(`/api/sets/${setId}`, { method: "DELETE" });
    router.push("/words");
    router.refresh();
  }

  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-paper";
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} className="icon-btn" aria-label={t("more")} aria-haspopup="menu" aria-expanded={open}>
        <span className="text-lg leading-none">⋯</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-line bg-card p-1 shadow-xl">
          {editHref && (
            <Link href={editHref} role="menuitem" className={item}>
              <I.IconEdit className="h-4 w-4" /> {t("edit")}
            </Link>
          )}
          {groups[0]?.words.length > 0 && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setExporting(true);
              }}
              className={item}
            >
              <I.IconArrowDown className="h-4 w-4" /> {t("export")}
            </button>
          )}
          {setId && (
            <button role="menuitem" onClick={remove} className={`${item} text-red-600 dark:text-red-400`}>
              <I.IconTrash className="h-4 w-4" /> {t("deleteSet")}
            </button>
          )}
        </div>
      )}
      <ExportWords groups={groups} open={exporting} onClose={() => setExporting(false)} />
    </div>
  );
}
