import Link from "next/link";
import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { getDb, schema } from "@/db";
import Shell from "@/components/Shell";
import LibraryFilters from "@/components/library/LibraryFilters";
import LibraryList from "@/components/library/LibraryList";
import { listDocuments } from "@/lib/documents/queries";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; label?: string | string[] }> }) {
  const t = await getTranslations("library");
  const sp = await searchParams;
  const labelIds = [sp.label ?? []].flat().map(Number).filter((n) => n > 0);
  const [docs, labels] = await Promise.all([
    listDocuments({ q: sp.q, labelIds }),
    getDb()
      .select({ id: schema.labels.id, kind: schema.labels.kind, name: schema.labels.name, emoji: schema.labels.emoji, color: schema.labels.color })
      .from(schema.labels)
      .orderBy(asc(schema.labels.kind), asc(schema.labels.position), asc(schema.labels.name)),
  ]);

  return (
    <Shell wide>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent2">{t("kicker")}</p>
          <h1 className="mt-1 font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
        </div>
        <Link href="/import" className="btn btn-primary">
          + {t("add")}
        </Link>
      </div>

      <div className="mt-5">
        <LibraryFilters labels={labels} />
      </div>

      {docs.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center">
          <p className="text-muted">{sp.q || labelIds.length ? t("noMatch") : t("empty")}</p>
          {!sp.q && !labelIds.length && (
            <Link href="/import" className="mt-3 inline-block text-accent underline">
              {t("importFirst")}
            </Link>
          )}
        </div>
      ) : (
        <LibraryList docs={docs} filtered={!!sp.q || labelIds.length > 0} />
      )}
    </Shell>
  );
}
