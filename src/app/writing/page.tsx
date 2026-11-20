import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import WritingStudio from "@/components/writing/WritingStudio";
import { getWriting, listWritings, type Grade, type WritingKind, WRITING_KINDS } from "@/lib/writing";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function WritingPage({ searchParams }: { searchParams: Promise<{ id?: string; new?: string; kind?: string }> }) {
  const t = await getTranslations("writing");
  const sp = await searchParams;
  const list = await listWritings();
  // Each type keeps its own draft: without an id, continue the latest unscored draft (of ?kind= if given); ?new=1 starts a blank one.
  const kind = (WRITING_KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as WritingKind) : undefined;
  const id = Number(sp.id) || (sp.new ? null : (list.find((w) => w.bandOverall == null && (!kind || w.kind === kind))?.id ?? null));
  const cur = id ? await getWriting(id) : undefined;
  const shown = (cur?.kind as WritingKind | undefined) ?? kind ?? "task2"; // the history lists only this type
  const mine = list.filter((w) => w.kind === shown);
  const initial = cur ? { id: cur.id, kind: cur.kind as WritingKind, prompt: cur.prompt ?? "", body: cur.body, grade: (cur.feedback as Grade | null) ?? null } : null;

  return (
    <Shell wide>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-6">
        <WritingStudio key={id ?? `new-${kind}`} initial={initial} kind={kind} />
        <aside className="mt-8 lg:mt-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-accent2">{t("history")}</h2>
            <Link href={`/writing?new=1&kind=${shown}`} className="text-sm text-accent underline">
              <I.IconPlus className="inline-block h-4 w-4 align-[-0.2em]" /> {t("new")}
            </Link>
          </div>
          {mine.length === 0 && <p className="text-sm text-muted">{t("noHistory")}</p>}
          <ul className="space-y-1.5">
            {mine.map((w) => (
              <li key={w.id}>
                <Link href={`/writing?id=${w.id}`} className={`block rounded-xl border px-3 py-2 text-sm ${w.id === id ? "border-accent bg-accent/10" : "border-line bg-card hover:border-accent"}`}>
                  <span className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{t(`kind.${w.kind as WritingKind}`)} · {t("words", { n: w.wordCount })}</span>
                    {w.bandOverall != null ? <b className="rounded bg-accent px-1.5 text-on-accent">{w.bandOverall}</b> : <span className="rounded bg-amber-100 px-1.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{t("draft")}</span>}
                  </span>
                  <span className="mt-0.5 line-clamp-2">{w.prompt || "…"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </Shell>
  );
}
