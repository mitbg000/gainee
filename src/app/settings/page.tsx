import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import AiSettings from "@/components/settings/AiSettings";
import ProfileSettings from "@/components/settings/ProfileSettings";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-widest text-accent2">{t("kicker")}</p>
      <h1 className="mt-1 font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <div className="mt-6 space-y-10">
        <ProfileSettings />
        <AiSettings />
      </div>
    </Shell>
  );
}
