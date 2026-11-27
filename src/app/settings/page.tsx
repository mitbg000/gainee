import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import AiSettings from "@/components/settings/AiSettings";
import AppearanceSettings from "@/components/settings/AppearanceSettings";
import AvatarSettings from "@/components/settings/AvatarSettings";
import ProfileSettings from "@/components/settings/ProfileSettings";
import { imageUrl } from "@/lib/images";
import { currentUser, requireRole } from "@/lib/users";
import { getLook, getTheme } from "@/theme/server";

const TABS = ["look", "profile", "ai"] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await getTranslations("settings");
  const q = (await searchParams).tab;
  const me = await currentUser();
  const tabs = (await requireRole("admin")) ? TABS : TABS.filter((x) => x !== "ai"); // AI providers and keys: admins only
  const tab = tabs.find((x) => x === q) ?? "look";
  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-widest text-accent2">{t("kicker")}</p>
      <h1 className="mt-1 font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <nav role="tablist" aria-label={t("title")} className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((x) => (
          <Link key={x} href={`/settings?tab=${x}`} role="tab" aria-selected={tab === x} className="tab" scroll={false}>
            {t(`tabs.${x}`)}
          </Link>
        ))}
      </nav>
      <div role="tabpanel" className="mt-6">
        {tab === "look" && <AppearanceSettings initial={await getLook()} theme={await getTheme()} />}
        {tab === "profile" && (
          <>
            <AvatarSettings url={me?.avatar ? imageUrl(me.avatar) : null} name={me?.name || me?.email || null} />
            <ProfileSettings />
          </>
        )}
        {tab === "ai" && <AiSettings />}
      </div>
    </Shell>
  );
}
