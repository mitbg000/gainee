import Link from "next/link";
import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { getDb, schema } from "@/db";
import Shell from "@/components/Shell";
import LabelChip from "@/components/labels/LabelChip";
import LibraryFilters from "@/components/library/LibraryFilters";
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
    <Shell>
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
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {docs.map((d) => {
            const pct = d.lessons ? Math.round((d.done / d.lessons) * 100) : 0;
            return (
              <li key={d.id}>
                <Link href={`/library/${d.id}`} className="flex h-full flex-col rounded-2xl border border-line bg-card p-4 transition hover:border-accent">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-serif text-lg font-bold leading-snug">{d.title}</h2>
                    {d.level && <span className="flex-none rounded bg-paper px-1.5 text-xs font-semibold text-muted">{d.level}</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{[d.author, d.source].filter(Boolean).join(" · ") || " "}</p>
                  {d.labels.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {d.labels.map((l) => (
                        <LabelChip key={l.id} name={l.name} emoji={l.emoji} color={l.color} className="text-xs" />
                      ))}
                    </div>
                  )}
                  <div className="mt-auto pt-3">
                    {d.status === "processing" ? (
                      <p className="text-sm text-accent">{t("generating", { ready: d.ready, total: d.lessons })}</p>
                    ) : d.status === "error" ? (
                      <p className="text-sm text-red-600 dark:text-red-400">{t("failed")}</p>
                    ) : (
                      <>
                        <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted">{t("progress", { done: d.done, total: d.lessons, words: d.wordCount })}</p>
                      </>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
