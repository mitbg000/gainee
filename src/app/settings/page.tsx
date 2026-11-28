import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import AppearanceSettings from "@/components/settings/AppearanceSettings";
import { getLook, getTheme } from "@/theme/server";

/**
 * Settings of this device in three tabs: appearance (light/dark, themes, accent, sidebar), text & language, sound & voice. The learning profile lives on the profile page,
 * the AI set-up under Admin (old links still arrive there).
 */
const TABS = ["look", "text", "sound"] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const q = (await searchParams).tab;
  if (q === "profile") redirect("/profile#me");
  if (q === "ai") redirect("/admin?tab=ai");
  const t = await getTranslations("settings");
  const tab = TABS.find((x) => x === q) ?? "look";
  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <nav role="tablist" aria-label={t("title")} className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((x) => (
          <Link key={x} href={`/settings?tab=${x}`} role="tab" aria-selected={tab === x} className="tab" scroll={false}>
            {t(`tabs.${x}`)}
          </Link>
        ))}
      </nav>
      <div role="tabpanel" className="mt-6">
        <AppearanceSettings initial={await getLook()} theme={await getTheme()} part={tab} />
      </div>
    </Shell>
  );
}
