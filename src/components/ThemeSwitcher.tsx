"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { THEME_COOKIE, themes, type Theme } from "@/theme/config";
import { IconMonitor, IconMoon, IconSun } from "./icons";

const ICON = { light: IconSun, dark: IconMoon, system: IconMonitor } satisfies Record<Theme, unknown>;

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeSwitcher({ initial, className = "" }: { initial: Theme; className?: string }) {
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

  return (
    <div role="group" aria-label={t("label")} className={`inline-flex rounded-lg border border-line bg-card p-0.5 text-xs ${className}`}>
      {themes.map((th) => {
        const Icon = ICON[th];
        return (
        <button
          key={th}
          type="button"
          title={t(th)}
          aria-label={t(th)}
          aria-pressed={th === theme}
          onClick={() => choose(th)}
          className={`rounded-md px-2 py-1.5 leading-none transition ${th === theme ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
        >
          <Icon className="h-4 w-4" />
        </button>
        );
      })}
    </div>
  );
}
