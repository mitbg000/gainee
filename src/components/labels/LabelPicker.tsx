"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { LabelWithCounts } from "@/lib/labels";
import { CHIP } from "./colors";

/** Toggle chips for choosing labels, grouped by kind. */
export default function LabelPicker({ value, onChange, kinds = ["topic", "source", "custom"] }: { value: number[]; onChange: (ids: number[]) => void; kinds?: ("topic" | "source" | "custom")[] }) {
  const t = useTranslations("labels");
  const [all, setAll] = useState<LabelWithCounts[] | null>(null);
  useEffect(() => {
    fetch("/api/labels").then(async (r) => setAll(await r.json()));
  }, []);
  if (!all) return <div className="h-8" />;
  if (!all.length)
    return (
      <p className="text-sm text-muted">
        {t("noneYet")}{" "}
        <Link href="/labels" className="text-accent underline">
          {t("manage")}
        </Link>
      </p>
    );

  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="space-y-2">
      {kinds.map((kind) => {
        const items = all.filter((l) => l.kind === kind);
        if (!items.length) return null;
        return (
          <div key={kind} className="flex flex-wrap items-center gap-1.5">
            <span className="w-full text-xs font-medium uppercase tracking-wide text-muted sm:w-24">{t(`kinds.${kind}.title`)}</span>
            {items.map((l) => {
              const on = value.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(l.id)}
                  className={`min-h-8 rounded-full px-3 text-sm transition ${on ? `${CHIP[l.color]} ring-2 ring-current/30` : "border border-line text-muted hover:text-ink"}`}
                >
                  {l.emoji && <span className="mr-1">{l.emoji}</span>}
                  {l.name}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
