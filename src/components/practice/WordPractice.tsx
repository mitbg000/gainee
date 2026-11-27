"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import ReviewPassage from "@/components/learn/ReviewPassage";
import SentencePractice from "@/components/learn/SentencePractice";
import Flashcards from "./Flashcards";
import Learn from "./Learn";
import Match from "./Match";
import PicturePractice from "./PicturePractice";
import Quiz from "./Quiz";
import { MODES, shuffle, type Mode, type PWord } from "./questions";
import * as I from "@/components/icons";

const ACTIVITIES = ["learn", "cards", "write", "picture", "passage", "test", "match"] as const;
type Activity = (typeof ACTIVITIES)[number];
const ICON: Record<Activity, React.ReactNode> = { cards: <I.IconCards />, learn: <I.IconTarget />, write: <I.IconPen />, picture: <I.IconImage />, passage: <I.IconBook />, test: <I.IconChecklist />, match: <I.IconSpark /> };
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
export default function WordPractice({ words, all, due }: { words: PWord[]; all: { term: string; meaning: string }[]; due: number }) {
  const t = useTranslations("practice");
  const [activity, setActivity] = useState<Activity>("learn");
  const [order, setOrder] = useState<Order>("recent");
  const [mode, setMode] = useState<Mode>("mix");
  const [size, setSize] = useState(20);
  const [running, setRunning] = useState<PWord[] | null>(null);

  useEffect(() => {
    setOrder(load("practice_order", ORDERS, "recent"));
    setMode(load("practice_mode", MODES, "mix"));
  }, []);

  if (words.length === 0) return <p className="text-muted">{t("empty")}</p>;

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
    const usable = activity === "picture" ? list.filter((w) => w.images?.length) : list;
    setRunning(usable.slice(0, activity === "match" ? Math.max(size, 6) : activity === "write" ? Math.min(size || 10, 10) : size || list.length));
  }
  const exit = () => setRunning(null);

  if (running) {
    if (activity === "cards") return <Flashcards words={running} onExit={exit} />;
    if (activity === "learn") return <Learn words={running} all={all} onExit={exit} />;
    if (activity === "match") return <Match words={running} onExit={exit} />;
    if (activity === "write") return <SentencePractice words={running.filter((w) => w.meaningVi || w.definitionEn)} onExit={exit} />;
    if (activity === "passage") return <ReviewPassage onExit={exit} />;
    if (activity === "picture") return <PicturePractice words={running} all={all} onExit={exit} />;
    return <Quiz words={shuffle(running)} all={all} mode={mode} onExit={exit} />;
  }

  return (
    <div className="space-y-6">
      {/* what to do first, Anki style: due reviews before new learning */}
      <div className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${due ? "border-accent/40 bg-accent/5" : "border-line bg-card"}`}>
        <span className={`flex size-10 flex-none items-center justify-center rounded-full ${due ? "bg-accent/10 text-accent" : "bg-green-500/15 text-green-600"}`}>{due ? <I.IconClock /> : <I.IconCheckCircle />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{due ? t("plan.due", { n: due }) : t("plan.none")}</p>
          <p className="text-sm text-muted">{due ? t("plan.dueTip") : t("plan.noneTip")}</p>
        </div>
        <Link href="/quick" className="btn btn-primary">
          <I.IconBolt /> {t("plan.quick")}
        </Link>
        {due > 0 && (
          <Link href="/review" className="btn btn-secondary">
            {t("plan.review")}
          </Link>
        )}
      </div>

      <div className="grid gap-5 rounded-2xl border border-line bg-card p-5 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold">{t("orderLabel")}</p>
          <div className="flex flex-wrap gap-2">
            {ORDERS.map((o) => (
              <button
                key={o}
                onClick={() => {
                  setOrder(o);
                  keep("practice_order", o);
                }}
                className={`chip ${order === o ? "chip-on" : ""}`}
              >
                {t(`order.${o}`)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t("sizeLabel")}</p>
          <div className="flex flex-wrap gap-2">
            {[10, 20, 50, 0].map((n) => (
              <button key={n} onClick={() => setSize(n)} className={`chip ${size === n ? "chip-on" : ""}`}>
                {n ? n : t("allWords", { n: words.length })}
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <p className="mb-2 text-sm font-semibold">{t("modeLabelTest")}</p>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  keep("practice_mode", m);
                }}
                title={t(`modeHint.${m}`)}
                className={`chip ${mode === m ? "chip-on" : ""}`}
              >
                {t(`mode.${m}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">{t("activityLabel")}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIVITIES.map((a) => (
            <button
              key={a}
              onClick={() => start(a)}
              className={`group flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-colors ${activity === a ? "border-accent/60 bg-card" : "border-line bg-card"} hover:border-accent hover:bg-accent/5`}
            >
              <span className="flex w-full items-center gap-2">
                <span className="flex size-10 items-center justify-center rounded-xl bg-paper text-accent group-hover:bg-accent group-hover:text-on-accent [&>svg]:size-5">{ICON[a]}</span>
                <I.IconPlay className="ml-auto h-4 w-4 text-muted group-hover:text-accent" />
              </span>
              <b>{t(`activity.${a}`)}</b>
              <span className="text-xs leading-snug text-muted">{t(`activityHint.${a}`)}</span>
              {a === "picture" && <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-muted">{t("withImages", { n: words.filter((w) => w.images?.length).length })}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
