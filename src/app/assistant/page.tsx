import { getTranslations } from "next-intl/server";
import AssistantChat from "@/components/AssistantChat";
import Shell from "@/components/Shell";

export default async function AssistantPage() {
  const t = await getTranslations("assistant");
  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      <div className="mt-5">
        <AssistantChat />
      </div>
    </Shell>
  );
}
