"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import ReviewPassage from "@/components/learn/ReviewPassage";
import SentencePractice from "@/components/learn/SentencePractice";
import Flashcards from "./Flashcards";
import Learn from "./Learn";
import Match from "./Match";
import Quiz from "./Quiz";
import { MODES, shuffle, type Mode, type PWord } from "./questions";
import * as I from "@/components/icons";
import { scopeAutoRead, setScopeAutoRead, setSpeakScope } from "@/lib/speech";

const ACTIVITIES = ["learn", "cards", "write", "passage", "test", "match"] as const;
type Activity = (typeof ACTIVITIES)[number];
const ICON: Record<Activity, React.ReactNode> = { cards: <I.IconCards />, learn: <I.IconTarget />, write: <I.IconPen />, passage: <I.IconBook />, test: <I.IconChecklist />, match: <I.IconSpark /> };
const ORDERS = ["recent", "random", "weak"] as const;
type Order = (typeof ORDERS)[number];

function load<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
const keep = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {}
};

/** Study hub in the manner of Quizlet (flashcards, learn, test, match), with a study suggestion from the review schedule. */
export default function WordPractice({ words, all, due, title, children }: { words: PWord[]; all: { term: string; meaning: string }[]; due: number; title: string; children?: React.ReactNode }) {
  const t = useTranslations("practice");
  const [activity, setActivity] = useState<Activity>("learn");
  const [order, setOrder] = useState<Order>("recent");
  const [mode, setMode] = useState<Mode>("mix");
  const [size, setSize] = useState(20);
  const [running, setRunning] = useState<PWord[] | null>(null);
  const [settings, setSettings] = useState(false);
  const [autoRead, setAutoRead] = useState(true);

  useEffect(() => {
    setOrder(load("practice_order", ORDERS, "recent"));
    setMode(load("practice_mode", MODES, "mix"));
    setAutoRead(scopeAutoRead("practice"));
    setSpeakScope("practice");
    return () => setSpeakScope(null);
  }, []);

  if (words.length === 0)
    return (
      <div>
        <h1 className="font-serif text-3xl font-bold md:text-4xl">{title}</h1>
        {children}
        <p className="mt-6 text-muted">{t("empty")}</p>
      </div>
    );

  /** Clicking a way of studying starts it at once, with the settings above. */
  function start(activity: Activity) {
    setActivity(activity);
    keep("practice_activity", activity);
    const list =
      order === "random"
        ? shuffle(words)
        : order === "weak"
          ? // forgotten most in review first, then the least practised
            [...words].sort((a, b) => (b.lapses ?? 0) - (a.lapses ?? 0) || (a.reps ?? 0) - (b.reps ?? 0))
          : words; // already newest first
    // writing sentences takes longer: at most 10 words a round
    const usable = list;
    setRunning(usable.slice(0, activity === "match" ? Math.max(size, 6) : activity === "write" ? Math.min(size || 10, 10) : size || list.length));
  }
  const exit = () => setRunning(null);

  if (running) {
    if (activity === "cards") return <Flashcards words={running} onExit={exit} />;
    if (activity === "learn") return <Learn words={running} all={all} onExit={exit} />;
    if (activity === "match") return <Match words={running} onExit={exit} />;
    if (activity === "write") return <SentencePractice words={running.filter((w) => w.meaningVi || w.definitionEn)} onExit={exit} />;
    if (activity === "passage") return <ReviewPassage onExit={exit} />;
    return <Quiz words={shuffle(running)} all={all} mode={mode} onExit={exit} />;
  }

  const tile = (a: Activity) => (
    <button
      key={a}
      onClick={() => start(a)}
      className={`group flex items-center gap-3 rounded-2xl border bg-card p-3.5 text-left transition-colors hover:border-accent hover:bg-accent/5 ${activity === a ? "border-accent/50" : "border-line"}`}
    >
      <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-paper text-accent group-hover:bg-accent group-hover:text-on-accent [&>svg]:size-5">{ICON[a]}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <b>{t(`activity.${a}`)}</b>
          {a === "learn" && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">{t("recommended")}</span>}
        </span>
      </span>
      <I.IconPlay className="h-4 w-4 flex-none text-muted group-hover:text-accent" />
    </button>
  );
  const chips = <T extends string | number>(list: readonly T[], value: T, on: (v: T) => void, label: (v: T) => string) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((v) => (
        <button key={String(v)} onClick={() => on(v)} className={`chip ${value === v ? "chip-on" : ""}`}>
          {label(v)}
        </button>
      ))}
    </div>
  );

  const row = (label: string, body: React.ReactNode) => (
    <div>
      <p className="mb-2 text-sm font-semibold">{label}</p>
      {body}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 font-serif text-3xl font-bold md:text-4xl">{title}</h1>
          <span className="hidden text-xs text-muted sm:inline">
            {t(`order.${order}`)} · {size || t("allWords", { n: words.length })}
          </span>
          <button onClick={() => setSettings(true)} className="icon-btn" aria-label={t("settings")} title={t("settings")}>
            <I.IconGear />
          </button>
        </div>
        {children}
      </div>

      {settings && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setSettings(false)}>
          <div role="dialog" aria-modal="true" aria-label={t("settings")} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-card p-5 shadow-xl">
            <div className="flex items-center">
              <h2 className="flex-1 font-bold">{t("settings")}</h2>
              <button onClick={() => setSettings(false)} className="icon-btn" aria-label={t("close")}>
                <I.IconX />
              </button>
            </div>
            {row(
              t("orderLabel"),
              chips(
                ORDERS,
                order,
                (o) => {
                  setOrder(o);
                  keep("practice_order", o);
                },
                (o) => t(`order.${o}`),
              ),
            )}
            {row(t("sizeLabel"), chips([10, 20, 50, 0] as const, size as 10 | 20 | 50 | 0, setSize, (n) => (n ? String(n) : t("allWords", { n: words.length }))))}
            {row(
              t("modeLabelTest"),
              chips(
                MODES,
                mode,
                (m) => {
                  setMode(m);
                  keep("practice_mode", m);
                },
                (m) => t(`mode.${m}`),
              ),
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRead}
                onChange={(e) => {
                  setAutoRead(e.target.checked);
                  setScopeAutoRead("practice", e.target.checked);
                }}
                className="size-4"
              />
              {t("autoRead")}
            </label>
            <button onClick={() => setSettings(false)} className="btn btn-primary w-full">
              {t("done")}
            </button>
          </div>
        </div>
      )}
      {/* what to do first, Anki style: due reviews before new learning */}
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-4 py-3 ${due ? "border-accent/40 bg-accent/5" : "border-line bg-card"}`}>
        <span className={due ? "text-accent" : "text-green-600"}>{due ? <I.IconClock /> : <I.IconCheckCircle />}</span>
        <p className="min-w-0 flex-1 text-sm">
          <b>{due ? t("plan.due", { n: due }) : t("plan.none")}</b>
        </p>
        {due > 0 && (
          <Link href="/review" className="btn btn-sm btn-primary">
            {t("plan.review")}
          </Link>
        )}
        <Link href="/quick" className={`btn btn-sm ${due ? "btn-secondary" : "btn-primary"}`}>
          <I.IconBolt /> {t("plan.quick")}
        </Link>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">{t("groups.learn")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(["learn", "cards", "test"] as const).map(tile)}</div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">{t("groups.deep")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(["write", "passage", "match"] as const).map(tile)}</div>
      </section>
    </div>
  );
}
