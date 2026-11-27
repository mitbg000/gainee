"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import { locales } from "@/i18n/config";
import Dropdown, { Segmented } from "./Dropdown";
import { IconChevronDown, IconGlobe } from "./icons";

/** `menu`: a globe button with a short menu (page headers); `segmented`: inline choice (menus, settings). */
/** `full`: names written out, filling the row (settings page). */
export default function LanguageSwitcher({ variant = "segmented", full = false }: { variant?: "segmented" | "menu"; full?: boolean }) {
  const t = useTranslations("language");
  const current = useLocale() as (typeof locales)[number];
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (l: (typeof locales)[number]) =>
    l !== current &&
    start(async () => {
      await setLocale(l);
      router.refresh();
    });

  if (variant === "menu")
    return (
      <Dropdown
        label={t("label")}
        value={current}
        onPick={pick}
        items={locales.map((l) => ({ value: l, label: t(l) }))}
        trigger={
          <>
            <IconGlobe className="h-[18px] w-[18px]" />
            <span className="uppercase">{current}</span>
            <IconChevronDown className="h-3.5 w-3.5 opacity-60" />
          </>
        }
      />
    );
  return <Segmented full={full} label={t("label")} value={current} onPick={pick} disabled={pending} items={locales.map((l) => ({ value: l, label: t(l), content: full ? t(l) : <span className="uppercase">{l}</span> }))} />;
}
