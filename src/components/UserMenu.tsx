"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { logout } from "@/lib/logout";
import { useEffect, useRef, useState } from "react";
import type { Theme } from "@/theme/config";
import InstallApp from "./InstallApp";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeSwitcher from "./ThemeSwitcher";
import * as I from "./icons";
import Avatar from "./Avatar";
import { fmtCredits } from "@/lib/fmtCredits";

export type Me = { avatar: string | null; name: string; email: string; /** null: admin, not charged */ credits: number | null; admin: boolean };

/** The avatar in the top bar: who is logged in, their pages (profile, credits, progress, settings, admin), light/dark, language, log out. */
export default function UserMenu({ theme, me }: { theme: Theme; me: Me }) {
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

  const row = "flex min-h-9 items-center gap-3 rounded-lg px-2.5 text-sm hover:bg-paper";
  const link = (href: string, icon: React.ReactNode, label: string, end?: React.ReactNode) => (
    <Link role="menuitem" href={href} className={row}>
      <span className="text-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {end}
    </Link>
  );
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("account")}
        title={t("account")}
        className={`flex size-9 items-center justify-center rounded-full border-2 transition-colors ${open ? "border-accent" : "border-line hover:border-accent/50"}`}
      >
        <Avatar url={me.avatar} name={me.name} className="size-8 text-sm" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-card p-1.5 shadow-xl">
          {/* who */}
          <Link href="/profile" className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-paper">
            <Avatar url={me.avatar} name={me.name} className="size-10 text-base" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{me.name}</span>
              <span className="block truncate text-xs text-muted">{me.email}</span>
            </span>
          </Link>
          <div className="my-1 border-t border-line" />
          {link("/profile", <I.IconUser className="h-4 w-4" />, tn("profile"))}
          {link(
            "/credits",
            <I.IconCoin className="h-4 w-4 text-amber-500 dark:text-amber-400" />,
            tn("credits"),
            me.credits !== null && <span className={`text-xs font-semibold tabular-nums ${me.credits <= 0 ? "text-red-600 dark:text-red-400" : "text-muted"}`}>{fmtCredits(me.credits)}</span>,
          )}
          {link("/progress", <I.IconChart className="h-4 w-4" />, tn("progress"))}
          {link("/settings", <I.IconGear className="h-4 w-4" />, tn("settings"))}
          {me.admin && link("/admin", <I.IconShield className="h-4 w-4" />, tn("admin"))}
          <div className="my-1 border-t border-line" />
          <div className="space-y-2 px-2.5 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">{t("theme")}</span>
              <ThemeSwitcher initial={theme} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">{t("language")}</span>
              <LanguageSwitcher />
            </div>
          </div>
          <div className="px-2.5 empty:hidden">
            <InstallApp />
          </div>
          <div className="my-1 border-t border-line" />
          <button role="menuitem" onClick={logout} className={`${row} w-full text-red-600 dark:text-red-400`}>
            <I.IconLogout className="h-4 w-4" /> {tn("logout")}
          </button>
        </div>
      )}
    </div>
  );
}
