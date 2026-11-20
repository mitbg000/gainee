import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import DictionaryLookup from "@/components/DictionaryLookup";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

type DictInfo = { name: string; entries: number; importedAt: string };

export default async function DictionaryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await getTranslations("dictionary");
  const { q } = await searchParams;
  const info = await getSetting<DictInfo>("dictionary.tudien").catch(() => undefined);

  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-widest text-accent2">{t("kicker")}</p>
      <h1 className="mt-1 font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted">
        {info ? t("info", { name: info.name, entries: info.entries }) : t("notImported")}
      </p>
      <div className="mt-5">
        <DictionaryLookup initialQuery={q} autoFocus={!q} />
      </div>
    </Shell>
  );
}
