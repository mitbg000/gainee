import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import AddYoutube from "@/components/listen/AddYoutube";
import DeleteSource from "@/components/listen/DeleteSource";
import Launcher from "@/components/listen/Launcher";
import { MISS_KINDS } from "@/lib/listen/check";
import IeltsToBank from "@/components/listen/IeltsToBank";
import { audioOf } from "@/lib/ielts/labels";
import { dueCount, ieltsParts, listSources, missTotals } from "@/lib/listen/queries";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

/** Listening bank: dictation sentences from YouTube videos and IELTS Listening parts. */
export default async function ListenPage() {
  const t = await getTranslations("listen");
  const [sources, due, misses, parts] = await Promise.all([listSources(), dueCount(), missTotals(), ieltsParts()]);
  const books = [...new Map(parts.map((p) => [p.bookId, p.book])).entries()];
  const missTotal = Object.values(misses).reduce((a, b) => a + b, 0);

  return (
    <Shell wide>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("intro")}</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Launcher due={due} sources={sources.filter((s) => s.n).map((s) => ({ id: s.id, title: s.title }))} />
        <AddYoutube />
      </div>

      {missTotal > 0 && (
        <div className="mt-4 rounded-2xl border border-line bg-card p-4">
          <p className="font-semibold">{t("misses.title")}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-5">
            {MISS_KINDS.map((k) => (
              <div key={k} className="rounded-xl bg-paper p-2.5">
                <div className="text-xl font-bold tabular-nums">{Math.round(((misses[k] ?? 0) / missTotal) * 100)}%</div>
                <div className="text-xs text-muted">{t(`misses.${k}`)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="mt-8 font-serif text-xl font-bold">{t("sources", { n: sources.length })}</h2>
      {sources.length === 0 && <p className="mt-2 text-sm text-muted">{t("empty")}</p>}
      <ul className="mt-3 space-y-2">
        {sources.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-3">
            {s.kind === "youtube" ? <I.IconPlay className="h-5 w-5 flex-none text-red-600" /> : <I.IconHeadphones className="h-5 w-5 flex-none text-accent" />}
            <div className="min-w-0 flex-1">
              <Link href={`/listen/${s.id}`} className="line-clamp-1 font-semibold hover:underline">
                {s.title}
              </Link>
              <div className="flex flex-wrap gap-x-3 text-xs text-muted">
                <span>{t("count", { n: s.n - s.hidden })}</span>
                <span>{t("seen", { pct: s.n ? Math.round((s.seen / s.n) * 100) : 0 })}</span>
                {s.due > 0 && <span className="font-semibold text-accent">{t("due", { n: s.due })}</span>}
                {s.captions === "auto" && <span>{t("autoCaptions")}</span>}
                {!s.reviewed && <span className="font-semibold text-amber-700 dark:text-amber-400">{t("notReviewed")}{s.low ? ` · ${t("low", { n: s.low })}` : ""}</span>}
              </div>
            </div>
            <Link href={`/listen/${s.id}?kind=listen`} className="btn btn-sm btn-ghost">
              <I.IconHeadphones /> <span className="hidden sm:inline">{t("modes.listen")}</span>
            </Link>
            <Link href={`/listen/${s.id}`} className="btn btn-sm btn-secondary">
              <I.IconPen /> <span className="hidden sm:inline">{t("modes.dictation")}</span>
            </Link>
            <Link href={`/listen/${s.id}/edit`} className="btn btn-sm btn-ghost">
              <I.IconEdit /> <span className="hidden sm:inline">{t("review")}</span>
            </Link>
            <DeleteSource id={s.id} title={s.title} />
          </li>
        ))}
      </ul>

      {/* IELTS Listening parts: add one to the bank here (or from its practice page) */}
      {parts.length > 0 && (
        <details className="mt-8 rounded-2xl border border-line bg-card p-4" open={!sources.some((s) => s.kind === "ielts")}>
          <summary className="cursor-pointer font-serif text-xl font-bold">{t("ieltsParts", { added: parts.filter((p) => p.sourceId).length, n: parts.length })}</summary>
          <p className="mt-1 text-sm text-muted">{t("ieltsPartsHint")}</p>
          {books.map(([bookId, book]) => (
            <div key={bookId} className="mt-4">
              <p className="text-sm font-semibold">{book}</p>
              <ul className="mt-1 divide-y divide-line">
                {parts
                  .filter((p) => p.bookId === bookId)
                  .map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="min-w-0 flex-1 text-sm">
                        {p.test} · Listening Part {p.part}
                      </span>
                      <IeltsToBank sectionId={p.id} audio={audioOf(p.audio)!} hasScript={p.script} sourceId={p.sourceId} />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </details>
      )}
    </Shell>
  );
}
