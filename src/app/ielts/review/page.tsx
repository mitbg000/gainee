import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import { mistakes } from "@/lib/ielts/queries";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

/** Questions still answered wrong (the latest try counts) and accuracy per question type, to see the weak types. */
export default async function IeltsReviewPage() {
  const t = await getTranslations("ielts");
  const { byType, wrong } = await mistakes();
  const types = Object.entries(byType).sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total);
  // one row per question group, newest first
  const groups = new Map<string, { sectionId: number; group: number; label: string; type: string; items: typeof wrong }>();
  for (const w of wrong) {
    const k = `${w.sectionId}:${w.group}`;
    if (!groups.has(k)) groups.set(k, { sectionId: w.sectionId, group: w.group, label: w.label, type: w.type, items: [] });
    groups.get(k)!.items.push(w);
  }

  return (
    <Shell wide>
      <Link href="/ielts" className="text-sm text-muted hover:underline">
        ← {t("title")}
      </Link>
      <h1 className="mt-1 font-serif text-3xl font-bold">{t("review.title")}</h1>

      {types.length > 0 && (
        <section className="mt-5 rounded-2xl border border-line bg-card p-5">
          <h2 className="font-bold">{t("review.byType")}</h2>
          <ul className="mt-3 space-y-2">
            {types.map(([type, v]) => {
              const pct = Math.round((v.right / v.total) * 100);
              return (
                <li key={type} className="flex items-center gap-3 text-sm">
                  <span className="w-44 flex-none truncate">{t(`types.${type}`)}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line/70">
                    <div className={`h-full rounded-full ${pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-24 flex-none text-right tabular-nums text-muted">
                    {pct}% · {v.right}/{v.total}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!wrong.length ? (
        <div className="mt-6 rounded-3xl border border-dashed border-line bg-card p-10 text-center">
          <I.BigIcon icon={I.IconCheckCircle} tone="green" />
          <p className="mt-3 text-muted">{t("review.none")}</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {[...groups.values()].map((g) => (
            <li key={`${g.sectionId}:${g.group}`} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.label}</span>
                <span className="chip">{t(`types.${g.type}`)}</span>
                <Link href={`/ielts/practice/${g.sectionId}?g=${g.group}`} className="btn btn-sm btn-primary">
                  <I.IconRefresh /> {t("review.redo")}
                </Link>
              </div>
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {g.items.map((w) => (
                  <li key={w.n} className="rounded-lg bg-paper px-2.5 py-1">
                    <b>{w.n}</b> <span className="text-red-600 line-through decoration-red-400">{w.given || "—"}</span> → <b className="text-green-700 dark:text-green-400">{w.key}</b>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
