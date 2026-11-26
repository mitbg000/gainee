"use client";

import { useTranslations } from "next-intl";
import * as I from "@/components/icons";

/**
 * The bar under a one-at-a-time exercise (dictation, listening, flashcards): previous on the left, where you are in
 * the middle, next on the right. The same on every screen.
 */
export default function StepNav({ n, total, onPrev, onNext, className = "" }: { n: number; total: number; onPrev: () => void; onNext: () => void; className?: string }) {
  const t = useTranslations("app");
  return (
    <nav className={`flex items-center justify-between gap-2 ${className}`} aria-label={t("steps")}>
      <button onClick={onPrev} disabled={n <= 1} className="btn btn-sm btn-ghost disabled:opacity-40">
        <I.IconChevronLeft /> <span className="hidden sm:inline">{t("prev")}</span>
      </button>
      <span className="font-mono text-sm tabular-nums text-muted">
        {n} / {total}
      </span>
      <button onClick={onNext} disabled={n >= total} className="btn btn-sm btn-ghost disabled:opacity-40">
        <span className="hidden sm:inline">{t("next")}</span> <I.IconChevronRight />
      </button>
    </nav>
  );
}
