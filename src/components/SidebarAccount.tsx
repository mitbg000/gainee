import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Avatar from "./Avatar";
import { IconGear } from "./icons";

/** Foot of the sidebar: who is logged in (→ profile) and settings. Credits are in the top bar and the account menu. */
export default async function SidebarAccount({ name, avatar }: { name: string; avatar: string | null }) {
  const t = await getTranslations("nav");
  return (
    <div className="mt-3 flex items-center gap-1 border-t border-line pt-3 group-data-[collapsed=true]/sb:flex-col">
      <Link href="/profile" title={t("profile")} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-paper group-data-[collapsed=true]/sb:flex-none group-data-[collapsed=true]/sb:px-1">
        <Avatar url={avatar} name={name} className="size-8 text-sm" />
        <span className="truncate text-sm font-semibold group-data-[collapsed=true]/sb:hidden">{name}</span>
      </Link>
      <Link href="/settings" className="icon-btn" aria-label={t("settings")} title={t("settings")}>
        <IconGear />
      </Link>
    </div>
  );
}
