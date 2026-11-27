"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { TreeDoc } from "@/lib/documents/queries";
import { fmtCredits } from "@/lib/fmtCredits";
import type { Theme } from "@/theme/config";
import { MuteButton } from "./SoundSettings";
import UserMenu from "./UserMenu";
import { NAV } from "./nav";
import * as I from "./icons";

/** Desktop top bar, kept minimal: where you are (breadcrumbs), quick look-up, due reviews and the user menu. */
export default function TopBar({ tree, due, theme, streak, credits, me }: { tree: TreeDoc[]; due: number; theme: Theme; streak: number; /** null: admin, not charged */ credits: number | null; me: { avatar: string | null; name: string } }) {
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
    <div className="chrome sticky top-0 z-30 hidden h-14 flex-none items-center gap-3 border-b border-line bg-card/90 px-6 backdrop-blur md:flex">
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
        className="relative hidden w-52 lg:block xl:w-64"
      >
        <I.IconDict className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tt("lookup")}
          aria-label={tt("lookup")}
          className="h-9 w-full rounded-full border border-transparent bg-ink/5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent focus:bg-card"
        />
      </form>

      {/* daily habit: quick study + the streak of days in a row */}
      <Link href="/quick" title={tt("quickTitle")} className="flex h-9 items-center gap-1.5 rounded-full bg-ink/5 px-3 text-sm font-semibold transition-colors hover:bg-accent/10 hover:text-accent">
        <I.IconBolt className="h-4 w-4" />
        <span className="hidden lg:inline">{tt("quick")}</span>
        <span className={`tabular-nums ${streak ? "text-orange-600 dark:text-orange-400" : "text-muted"}`} title={tt("streak", { n: streak })}>
          <I.IconFlame className="inline-block h-4 w-4 align-[-0.2em]" />
          {streak}
        </span>
      </Link>
      {credits !== null && (
        <Link href="/credits" title={tt("credits")} className={`flex h-9 items-center gap-1.5 rounded-full bg-ink/5 px-3 text-sm font-semibold tabular-nums transition-colors hover:bg-accent/10 hover:text-accent ${credits <= 0 ? "text-red-600 dark:text-red-400" : ""}`}>
          <I.IconCoin className="h-4 w-4" />
          {fmtCredits(credits)}
        </Link>
      )}
      <Link href="/review" className="icon-btn relative" aria-label={`${t("review")}${due ? ` (${due})` : ""}`} title={t("review")}>
        <I.IconCards />
        {due > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-[18px] tabular-nums text-on-accent">
            {due > 99 ? "99+" : due}
          </span>
        )}
      </Link>
      <MuteButton />
      <UserMenu theme={theme} me={me} />
    </div>
  );
}
