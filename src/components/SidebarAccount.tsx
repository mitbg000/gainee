import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Avatar from "./Avatar";
import { IconCoin, IconGear } from "./icons";
import { fmtCredits } from "@/lib/fmtCredits";

/** Foot of the sidebar: who is logged in (→ profile), their credits (→ top-up) and settings. */
export default async function SidebarAccount({ name, avatar, credits }: { name: string; avatar: string | null; /** null: admin, not charged */ credits: number | null }) {
  const t = await getTranslations("nav");
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center gap-1 group-data-[collapsed=true]/sb:flex-col">
        <Link href="/profile" title={t("profile")} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-paper group-data-[collapsed=true]/sb:flex-none group-data-[collapsed=true]/sb:px-1">
          <Avatar url={avatar} name={name} className="size-8 text-sm" />
          <span className="truncate text-sm font-semibold group-data-[collapsed=true]/sb:hidden">{name}</span>
        </Link>
        <Link href="/settings" className="icon-btn" aria-label={t("settings")} title={t("settings")}>
          <IconGear />
        </Link>
      </div>
      {credits !== null && (
        <Link
          href="/credits"
          title={t("credits")}
          className={`mt-1 flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold tabular-nums hover:bg-paper group-data-[collapsed=true]/sb:justify-center group-data-[collapsed=true]/sb:px-1 ${credits <= 0 ? "text-red-600 dark:text-red-400" : "text-muted hover:text-ink"}`}
        >
          <IconCoin className="h-4 w-4 shrink-0" />
          <span className="group-data-[collapsed=true]/sb:hidden">{t("creditsLeft", { n: fmtCredits(credits) })}</span>
        </Link>
      )}
    </div>
  );
}
