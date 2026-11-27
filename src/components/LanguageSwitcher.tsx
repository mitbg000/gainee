"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import { locales } from "@/i18n/config";
import Dropdown, { Segmented } from "./Dropdown";
import { IconChevronDown, IconGlobe } from "./icons";

/** `menu`: a globe button with a short menu (page headers); `segmented`: inline choice (menus, settings). */
export default function LanguageSwitcher({ variant = "segmented" }: { variant?: "segmented" | "menu" }) {
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
  return <Segmented label={t("label")} value={current} onPick={pick} disabled={pending} items={locales.map((l) => ({ value: l, label: t(l), content: <span className="uppercase">{l}</span> }))} />;
}
