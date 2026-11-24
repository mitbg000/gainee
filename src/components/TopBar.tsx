"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { TreeDoc } from "@/lib/documents/queries";
import type { Theme } from "@/theme/config";
import ThemeSwitcher from "./ThemeSwitcher";
import { NAV } from "./nav";
import * as I from "./icons";

/** Desktop top bar: where you are (breadcrumbs), quick word look-up, due reviews, light/dark and settings. */
export default function TopBar({ tree, due, theme }: { tree: TreeDoc[]; due: number; theme: Theme }) {
  const t = useTranslations("nav");
  const tt = useTranslations("topbar");
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");

  // breadcrumbs: section › text › part
  const crumbs: { href?: string; label: string }[] = [];
  const lessonId = Number(/^\/lessons\/(\d+)/.exec(path)?.[1]);
  const docId = Number(/^\/library\/(\d+)/.exec(path)?.[1]);
  const doc = tree.find((d) => d.id === docId || d.lessons.some((l) => l.id === lessonId));
  const section = lessonId ? NAV.find((n) => n.href === "/library") : [...NAV].reverse().find((n) => (n.href === "/" ? path === "/" : path === n.href || path.startsWith(n.href + "/")));
  if (section) crumbs.push({ href: section.href, label: t(section.key) });
  if (doc) {
    crumbs.push({ href: `/library/${doc.id}`, label: doc.title });
    const l = doc.lessons.find((x) => x.id === lessonId);
    if (l) crumbs.push({ label: tt("part", { n: l.position, title: l.title }) });
  }
  if (crumbs.length) delete crumbs[crumbs.length - 1].href; // the current page is not a link

  return (
    <div className="chrome sticky top-0 z-30 hidden h-14 flex-none items-center gap-4 border-b border-line bg-paper/90 px-6 backdrop-blur md:flex">
      <nav aria-label={tt("breadcrumbs")} className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((c, i) => (
            <li key={i} className={`flex min-w-0 items-center gap-1.5 ${i === crumbs.length - 1 ? "" : "flex-none"}`}>
              {i > 0 && <span className="text-muted/60">›</span>}
              {c.href ? (
                <Link href={c.href} className="max-w-[16rem] truncate text-muted hover:text-ink">
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page" className="truncate font-semibold">
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/dictionary?q=${encodeURIComponent(q.trim())}`);
          setQ("");
        }}
        className="relative hidden w-56 lg:block xl:w-72"
      >
        <I.IconDict className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("lookup")} aria-label={tt("lookup")} className="field field-sm w-full pl-8" />
      </form>

      <Link href="/review" className="btn btn-sm btn-secondary relative" title={t("review")}>
        <I.IconCards className="h-4 w-4" />
        <span className="hidden lg:inline">{tt("review")}</span>
        {due > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold tabular-nums text-on-accent">{due > 99 ? "99+" : due}</span>}
      </Link>
      <ThemeSwitcher initial={theme} />
      <Link href="/settings" className="icon-btn" aria-label={t("settings")} title={t("settings")}>
        <I.IconGear />
      </Link>
    </div>
  );
}
