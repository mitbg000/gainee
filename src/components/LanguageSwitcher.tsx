"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import { locales } from "@/i18n/config";

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const t = useTranslations("language");
  const current = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div role="group" aria-label={t("label")} className={`inline-flex rounded-lg border border-line bg-card p-0.5 text-xs ${className}`}>
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          aria-pressed={l === current}
          title={t(l)}
          onClick={() =>
            start(async () => {
              await setLocale(l);
              router.refresh();
            })
          }
          className={`rounded-md px-2.5 py-1.5 font-semibold uppercase transition ${
            l === current ? "bg-ink text-paper" : "text-muted hover:text-ink"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
