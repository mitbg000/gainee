import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import ImportBook from "@/components/ielts/ImportBook";

export default async function IeltsImportPage() {
  const t = await getTranslations("ielts.import");
  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold">{t("heading")}</h1>
      <p className="mt-1 mb-5 text-sm text-muted">{t("intro")}</p>
      <ImportBook />
    </Shell>
  );
}
