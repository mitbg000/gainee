"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { logout } from "@/lib/logout";
import { useEffect, useRef, useState } from "react";
import type { Theme } from "@/theme/config";
import InstallApp from "./InstallApp";
import LanguageSwitcher from "./LanguageSwitcher";
import SoundSettings from "./SoundSettings";
import ThemeSwitcher from "./ThemeSwitcher";
import * as I from "./icons";

/** The user icon in the top bar: settings, appearance, light/dark, language, install and log out in one menu. */
export default function UserMenu({ theme }: { theme: Theme }) {
  const t = useTranslations("topbar");
  const tn = useTranslations("nav");
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const row = "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm hover:bg-paper";
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("account")}
        title={t("account")}
        className={`flex size-9 items-center justify-center rounded-full border-2 transition-colors ${open ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-muted hover:border-accent/50 hover:text-ink"}`}
      >
        <I.IconUser className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-line bg-card p-2 shadow-xl">
          <Link role="menuitem" href="/settings" className={row}>
            <I.IconGear className="h-4 w-4 text-muted" /> {tn("settings")}
          </Link>
          <Link role="menuitem" href="/settings?tab=look" className={row}>
            <I.IconEye className="h-4 w-4 text-muted" /> {t("appearance")}
          </Link>
          <div className="my-2 border-t border-line" />
          <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
            <span className="text-muted">{t("theme")}</span>
            <ThemeSwitcher initial={theme} />
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
            <span className="text-muted">{t("language")}</span>
            <LanguageSwitcher />
          </div>
          <div className="my-2 border-t border-line" />
          <div className="px-3 py-1.5">
            <SoundSettings compact />
          </div>
          <div className="px-3 py-1.5 empty:hidden">
            <InstallApp />
          </div>
          <div className="my-2 border-t border-line" />
          <button
            role="menuitem"
            onClick={logout}
            className={`${row} w-full text-red-600 dark:text-red-400`}
          >
            <I.IconLogout className="h-4 w-4" /> {tn("logout")}
          </button>
        </div>
      )}
    </div>
  );
}
