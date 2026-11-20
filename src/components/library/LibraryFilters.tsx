"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { LabelRef } from "@/lib/documents/queries";
import { CHIP } from "@/components/labels/colors";

/** Search box + label chips; state lives in the URL (?q=…&label=1&label=4). */
export default function LibraryFilters({ labels }: { labels: LabelRef[] }) {
  const t = useTranslations("library");
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const selected = sp.getAll("label").map(Number);
  const [q, setQ] = useState(sp.get("q") ?? "");

  function push(next: { q?: string; labels?: number[] }) {
    const p = new URLSearchParams();
    const qq = next.q ?? q;
    if (qq) p.set("q", qq);
    for (const l of next.labels ?? selected) p.append("label", String(l));
    router.replace(`${path}${p.size ? `?${p}` : ""}`);
  }
  useEffect(() => {
    const id = setTimeout(() => q !== (sp.get("q") ?? "") && push({ q }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("search")}
        className="field w-full text-base"
      />
      {labels.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap">
          {labels.map((l) => {
            const on = selected.includes(l.id);
            return (
              <button
                key={l.id}
                aria-pressed={on}
                onClick={() => push({ labels: on ? selected.filter((x) => x !== l.id) : [...selected, l.id] })}
                className={`min-h-8 flex-none whitespace-nowrap rounded-full px-3 text-sm ${on ? `${CHIP[l.color]} ring-2 ring-current/30` : "border border-line bg-card text-muted"}`}
              >
                {l.emoji && <span className="mr-1">{l.emoji}</span>}
                {l.name}
              </button>
            );
          })}
          {selected.length > 0 && (
            <button onClick={() => push({ labels: [] })} className="min-h-8 flex-none px-2 text-sm text-accent">
              {t("clear")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
