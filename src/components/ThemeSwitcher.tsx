"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { THEME_COOKIE, themes, type Theme } from "@/theme/config";
import Dropdown, { Segmented } from "./Dropdown";
import { IconMonitor, IconMoon, IconSun } from "./icons";

const ICON = { light: IconSun, dark: IconMoon, system: IconMonitor } satisfies Record<Theme, unknown>;

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** `menu`: one icon button with Light / Dark / System (page headers); `segmented`: inline choice (menus, settings). */
export default function ThemeSwitcher({ initial, variant = "segmented" }: { initial: Theme; variant?: "segmented" | "menu" }) {
  const t = useTranslations("theme");
  const [theme, setTheme] = useState<Theme>(initial);

  // Follow OS changes while in "system" mode.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function choose(next: Theme) {
    setTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
    apply(next);
  }

  const Current = ICON[theme];
  if (variant === "menu")
    return (
      <Dropdown
        label={t("label")}
        value={theme}
        onPick={choose}
        items={themes.map((th) => {
          const Icon = ICON[th];
          return { value: th, label: t(th), icon: <Icon className="h-4 w-4" /> };
        })}
        trigger={<Current className="h-[18px] w-[18px]" />}
      />
    );
  return (
    <Segmented
      label={t("label")}
      value={theme}
      onPick={choose}
      items={themes.map((th) => {
        const Icon = ICON[th];
        return { value: th, label: t(th), content: <Icon className="h-4 w-4" /> };
      })}
    />
  );
}
