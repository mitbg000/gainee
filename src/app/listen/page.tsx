import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import AddYoutube from "@/components/listen/AddYoutube";
import DeleteSource from "@/components/listen/DeleteSource";
import Launcher from "@/components/listen/Launcher";
import { MISS_KINDS } from "@/lib/listen/check";
import IeltsToBank, { CutBook, RefreshWhile } from "@/components/listen/IeltsToBank";
import { cutJobs, lastCutProblem } from "@/lib/listen/jobs";
import { dueCount, ieltsParts, listSources, missTotals } from "@/lib/listen/queries";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

const TABS = ["practice", "library", "add", "ielts", "stats"] as const;
type Tab = (typeof TABS)[number];
const FILTERS = ["all", "youtube", "ielts", "draft"] as const;

/** Listening bank: dictation sentences from YouTube videos and IELTS Listening parts, in tabs (?tab=…). */
export default async function ListenPage({ searchParams }: { searchParams: Promise<{ tab?: string; filter?: string }> }) {
  const t = await getTranslations("listen");
  const q = await searchParams;
  const [sources, due, misses, parts, jobs, problem] = await Promise.all([listSources(), dueCount(), missTotals(), ieltsParts(), cutJobs(), lastCutProblem()]);
  const tab: Tab = TABS.find((x) => x === q.tab) ?? (sources.length ? "practice" : "add");
  const filter = FILTERS.find((x) => x === q.filter) ?? "all";
  const jobOf = new Map(jobs.flatMap((j) => j.sectionIds.map((s) => [s, { id: j.id, status: j.status, progress: j.progress }] as const)));
  const books = [...new Map(parts.map((p) => [p.bookId, p.book])).entries()];
  const missTotal = Object.values(misses).reduce((a, b) => a + b, 0);
  const total = sources.reduce((a, s) => a + s.n - s.hidden, 0);
  const seen = sources.reduce((a, s) => a + s.seen, 0);
  const drafts = sources.filter((s) => !s.reviewed).length;
  const running = jobs.reduce((a, j) => a + j.sectionIds.length, 0);

  const badge: Partial<Record<Tab, number | string>> = { practice: due || undefined, library: sources.length || undefined, ielts: running ? `${running}…` : parts.length ? `${parts.filter((p) => p.sourceId).length}/${parts.length}` : undefined };
  const shown = sources.filter((s) => (filter === "all" ? true : filter === "draft" ? !s.reviewed : s.kind === filter));
  const ICON: Record<Tab, React.ReactNode> = { practice: <I.IconBolt />, library: <I.IconHeadphones />, add: <I.IconPlus />, ielts: <I.IconClipboard />, stats: <I.IconChart /> };

  return (
    <Shell wide>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("intro")}</p>

      <div role="tablist" className="sticky top-[calc(env(safe-area-inset-top)+3rem)] z-20 -mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-line bg-paper/95 px-4 backdrop-blur md:top-14 md:mx-0 md:px-0">
        {TABS.map((k) => (
          <Link key={k} href={`/listen?tab=${k}`} role="tab" aria-selected={tab === k} className="tab" scroll={false}>
            {ICON[k]}
            {t(`tabs.${k}`)}
            {badge[k] !== undefined && <span className={`rounded-full px-1.5 text-xs tabular-nums ${k === "practice" ? "bg-accent text-on-accent" : "bg-ink/5 text-muted"}`}>{badge[k]}</span>}
          </Link>
        ))}
      </div>

      {/* parts being cut on the server: keep counts and progress fresh on every tab */}
      <RefreshWhile active={running > 0} />
      <div className="mt-5">
        {tab === "practice" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {total ? (
              <Launcher due={due} sources={sources.filter((s) => s.n).map((s) => ({ id: s.id, title: s.title }))} />
            ) : (
              <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">{t("empty")}</p>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Stat label={t("stat.due")} value={due} accent={due > 0} />
                <Stat label={t("stat.sentences")} value={total} />
                <Stat label={t("stat.seen")} value={`${total ? Math.round((seen / total) * 100) : 0}%`} />
              </div>
              {drafts > 0 && (
                <Link href="/listen?tab=library&filter=draft" className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <I.IconAlert className="h-4 w-4 flex-none" /> {t("draftsToReview", { n: drafts })}
                  <I.IconArrowRight className="ml-auto h-4 w-4" />
                </Link>
              )}
              <p className="text-xs text-muted">{t("practiceHint")}</p>
            </div>
          </div>
        )}

        {tab === "library" && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map((f) => (
                <Link key={f} href={`/listen?tab=library&filter=${f}`} scroll={false} className={`chip ${filter === f ? "chip-on" : ""}`}>
                  {t(`filters.${f}`)} · {f === "all" ? sources.length : f === "draft" ? drafts : sources.filter((s) => s.kind === f).length}
                </Link>
              ))}
              <Link href="/listen?tab=add" className="btn btn-sm btn-ghost ml-auto">
                <I.IconPlus /> {t("tabs.add")}
              </Link>
            </div>
            {shown.length === 0 && <p className="mt-4 text-sm text-muted">{sources.length ? t("noneInFilter") : t("empty")}</p>}
            <ul className="mt-3 space-y-2">
              {shown.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-3">
                  {s.kind === "youtube" ? <I.IconPlay className="h-5 w-5 flex-none text-red-600" /> : <I.IconHeadphones className="h-5 w-5 flex-none text-accent" />}
                  <div className="min-w-0 flex-1">
                    <Link href={`/listen/${s.id}`} className="line-clamp-1 font-semibold hover:underline">
                      {s.title}
                    </Link>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line/70">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${s.n ? Math.round((s.seen / s.n) * 100) : 0}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-muted">
                        <span>{t("count", { n: s.n - s.hidden })}</span>
                        <span>{t("seen", { pct: s.n ? Math.round((s.seen / s.n) * 100) : 0 })}</span>
                        {s.due > 0 && <span className="font-semibold text-accent">{t("due", { n: s.due })}</span>}
                        {s.captions === "auto" && <span>{t("autoCaptions")}</span>}
                        {!s.reviewed && <span className="font-semibold text-amber-700 dark:text-amber-400">{t("notReviewed")}{s.low ? ` · ${t("low", { n: s.low })}` : ""}</span>}
                      </div>
                    </div>
                  </div>
                  <Link href={`/listen/${s.id}?kind=listen`} className="btn btn-sm btn-ghost" title={t("modes.listen")}>
                    <I.IconHeadphones /> <span className="hidden sm:inline">{t("modes.listen")}</span>
                  </Link>
                  <Link href={`/listen/${s.id}`} className="btn btn-sm btn-secondary" title={t("modes.dictation")}>
                    <I.IconPen /> <span className="hidden sm:inline">{t("modes.dictation")}</span>
                  </Link>
                  <Link href={`/listen/${s.id}/edit`} className={`btn btn-sm ${s.reviewed ? "btn-ghost" : "btn-secondary"}`} title={t("review")}>
                    <I.IconEdit /> <span className="hidden sm:inline">{t("review")}</span>
                  </Link>
                  <DeleteSource id={s.id} title={s.title} />
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === "add" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <AddYoutube />
            <div className="space-y-2 rounded-2xl border border-line bg-card p-4 text-sm">
              <p className="font-semibold">{t("addSteps.title")}</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted">
                <li>{t("addSteps.one")}</li>
                <li>{t("addSteps.two")}</li>
                <li>{t("addSteps.three")}</li>
              </ol>
              <Link href="/listen?tab=ielts" className="inline-flex items-center gap-1 text-accent underline">
                {t("addSteps.ielts")} <I.IconArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {tab === "ielts" && (
          <div className="rounded-2xl border border-line bg-card p-4">
            <p className="text-sm text-muted">{t("ieltsPartsHint")}</p>
            {problem && (
              <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {t("ielts.problem", { parts: problem.parts, error: t.has(`ielts.errors.${problem.error}`) ? t(`ielts.errors.${problem.error}`) : problem.error })}
              </p>
            )}
            {parts.length === 0 && <p className="mt-3 text-sm text-muted">{t("ieltsNone")}</p>}
            {books.map(([bookId, book]) => {
              const mine = parts.filter((p) => p.bookId === bookId);
              return (
                <div key={bookId} className="mt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-sm font-semibold">
                      {book} <span className="font-normal text-muted">· {mine.filter((p) => p.sourceId).length}/{mine.length}</span>
                    </p>
                    <CutBook bookId={bookId} left={mine.filter((p) => p.script && !p.sourceId && !jobOf.has(p.id)).length} />
                  </div>
                  <ul className="mt-1 divide-y divide-line">
                    {mine.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="min-w-0 flex-1 text-sm">
                          {p.test} · Listening Part {p.part}
                        </span>
                        <IeltsToBank sectionId={p.id} hasScript={p.script} sourceId={p.sourceId} job={jobOf.get(p.id) ?? null} refresh={false} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {tab === "stats" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={t("stat.sources")} value={sources.length} />
              <Stat label={t("stat.sentences")} value={total} />
              <Stat label={t("stat.seen")} value={`${total ? Math.round((seen / total) * 100) : 0}%`} />
              <Stat label={t("stat.due")} value={due} accent={due > 0} />
            </div>
            <div className="rounded-2xl border border-line bg-card p-4">
              <p className="font-semibold">{t("misses.title")}</p>
              {missTotal === 0 ? (
                <p className="mt-2 text-sm text-muted">{t("misses.none")}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {MISS_KINDS.map((k) => {
                    const pct = Math.round(((misses[k] ?? 0) / missTotal) * 100);
                    return (
                      <li key={k} className="grid grid-cols-[minmax(0,12rem)_1fr_3rem] items-center gap-3 text-sm">
                        <span className="truncate">{t(`misses.${k}`)}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-line/70">
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="text-right tabular-nums text-muted">{pct}%</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted">{t("misses.hint")}</p>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${accent ? "border-accent bg-accent/5" : "border-line bg-card"}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
