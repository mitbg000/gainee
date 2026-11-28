import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import AppearanceSettings from "@/components/settings/AppearanceSettings";
import { getLook, getTheme } from "@/theme/server";

/**
 * Settings of this device: light/dark, language, reading look, sounds. The learning profile lives on the profile page,
 * the AI set-up under Admin (old links still arrive there).
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const q = (await searchParams).tab;
  if (q === "profile") redirect("/profile#me");
  if (q === "ai") redirect("/admin?tab=ai");
  const t = await getTranslations("settings");
  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <div className="mt-6">
        <AppearanceSettings initial={await getLook()} theme={await getTheme()} />
      </div>
    </Shell>
  );
}
