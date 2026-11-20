"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { NAV, type NavItem } from "./nav";
import * as I from "./icons";

const ICONS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  home: I.IconHome, book: I.IconBook, plus: I.IconPlus, dict: I.IconDict, words: I.IconWords,
  cards: I.IconCards, chart: I.IconChart, spark: I.IconSpark, gear: I.IconGear,
};

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

/** Desktop sidebar list. */
export function SidebarNav() {
  const t = useTranslations("nav");
  const path = usePathname();
  return (
    <nav className="mt-6 flex flex-col gap-0.5">
      {NAV.map((n) => (
        <Item key={n.key} n={n} active={isActive(path, n.href)} label={t(n.key)} soon={n.phase ? t("phase", { n: n.phase }) : undefined} />
      ))}
    </nav>
  );
}

function Item({ n, active, label, soon, onClick }: { n: NavItem; active: boolean; label: string; soon?: string; onClick?: () => void }) {
  const Icon = ICONS[n.icon];
  const cls = `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm ${
    soon ? "pointer-events-none text-muted/60" : active ? "bg-accent/10 font-semibold text-accent" : "hover:bg-paper"
  }`;
  return (
    <Link href={soon ? "#" : n.href} aria-disabled={!!soon} aria-current={active ? "page" : undefined} className={cls} onClick={onClick}>
      <Icon />
      <span className="flex-1">{label}</span>
      {soon && <span className="rounded bg-paper px-1.5 text-[10px]">{soon}</span>}
    </Link>
  );
}

/**
 * Mobile: fixed bottom tab bar (4 main sections + "More").
 * "More" opens a bottom sheet with the full menu and the extra controls passed as children.
 */
export function MobileTabBar({ children }: { children: React.ReactNode }) {
  const t = useTranslations("nav");
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const tabs = NAV.filter((n) => n.mobileTab);
  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5">
          {tabs.map((n) => {
            const Icon = ICONS[n.icon];
            const active = isActive(path, n.href);
            return (
              <li key={n.key}>
                <Link
                  href={n.phase ? "#" : n.href}
                  aria-disabled={!!n.phase}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                    n.phase ? "pointer-events-none text-muted/50" : active ? "text-accent" : "text-muted"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="max-w-full truncate px-1">{t(`tab.${n.key}`)}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              onClick={() => setOpen(true)}
              className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] text-muted"
              aria-expanded={open}
            >
              <I.IconMenu className="h-6 w-6" />
              <span>{t("more")}</span>
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button aria-label={t("more")} className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-line bg-card p-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
            <div className="flex flex-col gap-0.5">
              {NAV.filter((n) => !n.mobileTab).map((n) => (
                <Item
                  key={n.key}
                  n={n}
                  active={isActive(path, n.href)}
                  label={t(n.key)}
                  soon={n.phase ? t("phase", { n: n.phase }) : undefined}
                  onClick={() => setOpen(false)}
                />
              ))}
            </div>
            <div className="mt-4 border-t border-line pt-4">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
