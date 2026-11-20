import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { getDb, schema } from "@/db";
import Shell from "@/components/Shell";
import ImportForm from "@/components/library/ImportForm";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const t = await getTranslations("import");
  const sources = (await getDb().select({ name: schema.labels.name }).from(schema.labels).where(eq(schema.labels.kind, "source"))).map((s) => s.name);
  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-widest text-accent2">{t("kicker")}</p>
      <h1 className="mt-1 font-serif text-3xl font-bold md:text-4xl">{t("heading")}</h1>
      <p className="mt-2 text-sm text-muted">{t("intro")}</p>
      <div className="mt-6">
        <ImportForm sources={sources} />
      </div>
    </Shell>
  );
}
