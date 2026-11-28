import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import LabelManager from "@/components/labels/LabelManager";

export default async function LabelsPage() {
  const t = await getTranslations("labels");
  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-widest text-accent2">{t("kicker")}</p>
      <h1 className="mt-1 font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <div className="mt-6">
        <LabelManager />
      </div>
    </Shell>
  );
}
