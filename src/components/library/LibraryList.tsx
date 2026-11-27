"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type { LibraryItem } from "@/lib/documents/queries";
import LabelChip from "@/components/labels/LabelChip";

type Status = "all" | "reading" | "new" | "done";
type Sort = "added" | "read" | "title";
type View = "grid" | "list";

const statusOf = (d: LibraryItem): Exclude<Status, "all"> => (d.lessons > 0 && d.done === d.lessons ? "done" : d.done > 0 ? "reading" : "new");
const minutes = (words: number) => Math.max(1, Math.round(words / 200)); // ~200 words a minute for a learner

/** Library: "continue reading" first, then the texts filtered by reading status, sorted and shown as cards or a list. */
export default function LibraryList({ docs, filtered }: { docs: LibraryItem[]; filtered: boolean }) {
  const t = useTranslations("library");
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<Sort>("added");
  const [view, setView] = useState<View>("grid");
  useEffect(() => {
    try {
      const s = localStorage.getItem("lib_sort") as Sort | null;
      if (s && ["added", "read", "title"].includes(s)) setSort(s);
      if (localStorage.getItem("lib_view") === "list") setView("list");
    } catch {}
  }, []);
  const keep = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };

  const counts = useMemo(() => {
    const c = { all: docs.length, reading: 0, new: 0, done: 0 };
    for (const d of docs) c[statusOf(d)]++;
    return c;
  }, [docs]);
  const shown = useMemo(() => {
    const list = status === "all" ? [...docs] : docs.filter((d) => statusOf(d) === status);
    if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title, "vi"));
    if (sort === "read") list.sort((a, b) => (b.lastRead ?? "").localeCompare(a.lastRead ?? ""));
    return list;
  }, [docs, status, sort]);
  const continuing = useMemo(
    () =>
      docs
        .filter((d) => statusOf(d) === "reading" && d.nextLessonId)
        .sort((a, b) => (b.lastRead ?? "").localeCompare(a.lastRead ?? ""))
        .slice(0, 3),
    [docs],
  );

  /** Where the main button goes: the next unfinished part, the first part, or the text's page. */
  const cta = (d: LibraryItem) => {
    if (d.status === "processing" || d.status === "error" || !d.firstLessonId) return null;
    const s = statusOf(d);
    if (s === "done") return { href: `/lessons/${d.firstLessonId}`, label: t("readAgain") };
    if (s === "reading") return { href: `/lessons/${d.nextLessonId}`, label: t("continuePart", { n: d.nextPosition ?? 1 }) };
    return { href: `/lessons/${d.firstLessonId}`, label: t("start") };
  };
  const progress = (d: LibraryItem) =>
    d.status === "processing" ? (
      <p className="text-sm text-accent">{t("generating", { ready: d.ready, total: d.lessons })}</p>
    ) : d.status === "error" ? (
      <p className="text-sm text-red-600 dark:text-red-400">{t("failed")}</p>
    ) : (
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/70">
          <div className={`h-full rounded-full ${statusOf(d) === "done" ? "bg-green-500" : "bg-accent"}`} style={{ width: `${d.lessons ? (d.done / d.lessons) * 100 : 0}%` }} />
        </div>
        <span className="flex-none text-xs tabular-nums text-muted">{t("parts", { done: d.done, total: d.lessons })}</span>
      </div>
    );
  const meta = (d: LibraryItem) => t("meta", { parts: d.lessons, words: d.wordCount, min: minutes(d.wordCount) });

  return (
    <div className="mt-6 space-y-8">
      {!filtered && continuing.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("continueTitle")}</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {continuing.map((d) => (
              <Link key={d.id} href={`/lessons/${d.nextLessonId}`} className="group flex flex-col rounded-2xl border border-line border-l-4 border-l-accent bg-card p-4 transition hover:border-accent hover:shadow-sm">
                <span className="text-xs font-semibold text-accent2">{t("continuePart", { n: d.nextPosition ?? 1 })}</span>
                <span className="mt-1 line-clamp-2 font-serif text-lg font-bold leading-snug">{d.title}</span>
                <span className="mt-auto pt-3">{progress(d)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" className="flex flex-wrap gap-1.5">
            {(["all", "reading", "new", "done"] as const).map((s) => (
              <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)} className={`chip ${status === s ? "chip-on" : ""}`}>
                {t(`status.${s}`)} <span className="tabular-nums opacity-70">{counts[s]}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as Sort);
                keep("lib_sort", e.target.value);
              }}
              aria-label={t("sortLabel")}
              className="field field-sm w-auto"
            >
              {(["added", "read", "title"] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`sort.${s}`)}
                </option>
              ))}
            </select>
            <div className="inline-flex overflow-hidden rounded-lg border border-line bg-card" role="group" aria-label={t("viewLabel")}>
              {(["grid", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setView(v);
                    keep("lib_view", v);
                  }}
                  aria-pressed={view === v}
                  title={t(`view.${v}`)}
                  aria-label={t(`view.${v}`)}
                  className={`flex size-9 items-center justify-center ${view === v ? "bg-accent/15 text-accent" : "text-muted hover:bg-paper"}`}
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    {v === "grid" ? (
                      <>
                        <rect x="4" y="4" width="7" height="7" rx="1.5" />
                        <rect x="13" y="4" width="7" height="7" rx="1.5" />
                        <rect x="4" y="13" width="7" height="7" rx="1.5" />
                        <rect x="13" y="13" width="7" height="7" rx="1.5" />
                      </>
                    ) : (
                      <path d="M5 6h14M5 12h14M5 18h14" strokeLinecap="round" />
                    )}
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center text-muted">{t("noMatch")}</p>
        ) : view === "grid" ? (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((d) => {
              const c = cta(d);
              return (
                <li key={d.id} className="flex flex-col rounded-2xl border border-line bg-card p-4 transition hover:border-accent/60 hover:shadow-sm">
                  <div className="flex items-center gap-2 text-xs">
                    {d.level && <span className="rounded-md bg-accent/10 px-1.5 py-0.5 font-bold text-accent">{d.level}</span>}
                    <span className="text-muted">{meta(d)}</span>
                    {(!d.mine || d.visibility !== "private") && <span className="ml-auto rounded-md bg-paper px-1.5 py-0.5 text-muted">{d.mine ? t(`shared.${d.visibility}`) : t("shared.fromTeacher")}</span>}
                  </div>
                  <Link href={`/library/${d.id}`} className="mt-2 font-serif text-lg font-bold leading-snug hover:text-accent">
                    {d.title}
                  </Link>
                  {(d.author || d.source) && <p className="mt-0.5 truncate text-sm text-muted">{[d.author, d.source].filter(Boolean).join(" · ")}</p>}
                  {d.labels.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {d.labels.map((l) => (
                        <LabelChip key={l.id} name={l.name} emoji={l.emoji} color={l.color} className="text-xs" />
                      ))}
                    </div>
                  )}
                  <div className="mt-auto space-y-3 pt-4">
                    {progress(d)}
                    <div className="flex gap-2">
                      {c && (
                        <Link href={c.href} className="btn btn-sm btn-primary flex-1">
                          {c.label}
                        </Link>
                      )}
                      <Link href={`/library/${d.id}`} className={`btn btn-sm btn-secondary ${c ? "" : "flex-1"}`}>
                        {t("details")}
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {shown.map((d) => {
              const c = cta(d);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-paper/60">
                  <div className="min-w-0 flex-1 basis-64">
                    <Link href={`/library/${d.id}`} className="font-serif font-bold hover:text-accent">
                      {d.title}
                    </Link>
                    <p className="truncate text-xs text-muted">
                      {d.level && <b className="mr-1.5 text-accent">{d.level}</b>}
                      {[d.author || d.source, meta(d)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="w-40 flex-none">{progress(d)}</div>
                  {c && (
                    <Link href={c.href} className="btn btn-sm btn-secondary flex-none">
                      {c.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
