"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { autoSpeak, speak } from "@/lib/speech";
import { meaningOf, norm, options, shuffle, type PWord } from "./questions";
import * as I from "@/components/icons";
import { sfx } from "@/lib/sound";

const ROUND = 7;
type Q = { w: PWord; kind: "mcMeaning" | "mcTerm" | "write"; options?: string[]; answer: string };

/**
 * Quizlet-style "Learn": rounds of 7 words. A word is first asked as multiple choice, then must be typed;
 * a word answered wrongly comes back later in the same round. Done when every word is mastered (typed right).
 */
export default function Learn({ words, all, onExit }: { words: PWord[]; all: { term: string; meaning: string }[]; onExit: () => void }) {
  const t = useTranslations("practice.learn");
  const [level, setLevel] = useState<Record<number, number>>({}); // 0 new, 1 passed multiple choice, 2 mastered
  const [queue, setQueue] = useState<Q[]>(() => round({}));
  const [roundNo, setRoundNo] = useState(1);
  const [given, setGiven] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [overridden, setOverridden] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const auto = useRef<ReturnType<typeof setTimeout>>(undefined);

  const lv = (w: PWord) => level[w.id] ?? 0;
  const mastered = words.filter((w) => lv(w) === 2).length;
  const seen = words.filter((w) => w.id in level).length;

  function question(w: PWord, l: number): Q {
    if (l === 0 && meaningOf(w)) {
      const toTerm = Math.random() < 0.5;
      const o = toTerm ? options(w.term, all.map((x) => x.term)) : options(meaningOf(w), all.map((x) => x.meaning));
      if (o) return { w, kind: toTerm ? "mcTerm" : "mcMeaning", options: o, answer: toTerm ? w.term : meaningOf(w) };
    }
    return { w, kind: "write", answer: w.term };
  }
  function round(lv0: Record<number, number>) {
    // words already in progress first, then new ones, so a round finishes what was started
    const open = words.filter((w) => (lv0[w.id] ?? 0) < 2);
    const pick = [...open.filter((w) => (lv0[w.id] ?? 0) === 1), ...open.filter((w) => !(lv0[w.id] ?? 0))].slice(0, ROUND);
    return shuffle(pick).map((w) => question(w, lv0[w.id] ?? 0));
  }
  function nextRound(lv0 = level) {
    setQueue(round(lv0));
    setRoundNo((n) => n + 1);
  }

  const q = queue[0];
  const right = given !== null && (overridden || norm(given) === norm(q?.answer ?? ""));

  useEffect(() => {
    if (q?.kind === "write" && given === null) setTimeout(() => input.current?.focus(), 30);
  }, [q, given]);
  useEffect(() => {
    if (q?.kind === "mcMeaning") autoSpeak(q.w.term);
  }, [q]);

  function answer(a: string) {
    if (!q || given !== null) return;
    setGiven(a);
    sfx(norm(a) === norm(q.answer) ? "correct" : "wrong");
    if (q.kind !== "mcMeaning") autoSpeak(q.w.term);
    // a right multiple-choice answer moves on by itself, as in Quizlet
    if (q.kind !== "write" && norm(a) === norm(q.answer)) auto.current = setTimeout(() => advance(true, a), 700);
  }
  function advance(ok = right, a = given) {
    clearTimeout(auto.current);
    if (!q || a === null) return;
    const l = lv(q.w);
    const nextLevel = ok ? Math.min(2, l + 1) : l;
    const lvls = { ...level, [q.w.id]: nextLevel };
    setLevel(lvls);
    const rest = queue.slice(1);
    // wrong → asked again at the end of this round; right multiple choice → now it must be typed
    const nq = ok ? (nextLevel === 1 ? [...rest, question(q.w, 1)] : rest) : [...rest, question(q.w, l)];
    setQueue(nq);
    if (!nq.length) sfx("done");
    setGiven(null);
    setTyped("");
    setOverridden(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q) {
        if (e.key === "Enter" && mastered < words.length) nextRound();
        return;
      }
      if (given !== null && e.key === "Enter" && q.kind !== "write") return (e.preventDefault(), advance());
      if (given === null && q.options && /^[1-4]$/.test(e.key)) answer(q.options[Number(e.key) - 1] ?? "");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const bars = (
    <div className="mb-4 grid grid-cols-3 gap-3 text-xs">
      {[
        [words.length - seen, t("notStudied"), "bg-line"],
        [seen - mastered, t("learning"), "bg-amber-400"],
        [mastered, t("mastered"), "bg-green-500"],
      ].map(([n, label, bg]) => (
        <div key={label as string}>
          <div className="flex justify-between text-muted">
            <span>{label}</span>
            <b className="tabular-nums text-ink">{n}</b>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/70">
            <div className={`h-full rounded-full transition-all ${bg}`} style={{ width: `${((n as number) / words.length) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );

  /* ---------- between rounds / finished ---------- */
  if (!q) {
    const finished = mastered === words.length;
    return (
      <div className="mx-auto max-w-2xl">
        {bars}
        <div className="rounded-3xl border border-line bg-card p-8 text-center">
          <I.BigIcon icon={finished ? I.IconTrophy : I.IconSpark} tone={finished ? "amber" : "accent"} />
          <p className="mt-2 font-serif text-2xl font-bold">{finished ? t("finished", { n: words.length }) : t("roundDone", { n: roundNo })}</p>
          <p className="mt-1 text-sm text-muted">{finished ? t("finishedTip") : t("progress", { done: mastered, total: words.length })}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {!finished && (
              <button onClick={() => nextRound()} autoFocus className="btn btn-primary">
                {t("continue")} <I.IconEnter />
              </button>
            )}
            {finished && (
              <button
                onClick={() => {
                  setLevel({});
                  nextRound({});
                }}
                className="btn btn-primary"
              >
                {t("again")}
              </button>
            )}
            <button onClick={onExit} className="btn btn-secondary">
              {t("exit")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- question ---------- */
  const w = q.w;
  return (
    <div className="mx-auto max-w-2xl">
      {bars}
      <div className="rounded-3xl border border-line bg-card p-6 md:p-8">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-accent2">
          <span>{t(`ask.${q.kind}`)}</span>
          {lv(w) === 0 && !(w.id in level) && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700 dark:bg-sky-950 dark:text-sky-300">{t("new")}</span>}
        </div>
        <div className="mt-3 min-h-20">
          {q.kind === "mcMeaning" ? (
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-serif text-3xl font-bold">{w.term}</span>
              {w.ipa && <span className="text-muted">{w.ipa}</span>}
              <button onClick={() => speak(w.term)} aria-label={t("listen")}>
                <I.IconSpeaker className="inline-block h-4 w-4 align-[-0.2em]" />
              </button>
            </p>
          ) : (
            <p className="text-xl font-semibold">{meaningOf(w) || w.context}</p>
          )}
        </div>

        {q.options ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {q.options.map((o, k) => {
              const ok = norm(o) === norm(q.answer);
              const state = given === null ? "hover:border-accent" : ok ? "border-green-500 bg-green-50 dark:bg-green-950/40" : o === given ? "border-red-400 bg-red-50 dark:bg-red-950/40" : "opacity-50";
              return (
                <button key={k} disabled={given !== null} onClick={() => answer(o)} className={`flex min-h-14 items-center gap-3 rounded-2xl border-2 border-line px-4 text-left ${state}`}>
                  <span className="flex size-6 flex-none items-center justify-center rounded-full bg-paper text-xs text-muted">{k + 1}</span>
                  {o}
                </button>
              );
            })}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (given === null) answer(typed);
              else advance();
            }}
            className="mt-4"
          >
            <input
              ref={input}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              readOnly={given !== null}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t("typeHere")}
              className={`min-h-14 w-full rounded-2xl border-2 bg-paper px-4 text-lg outline-none ${given === null ? "border-line focus:border-accent" : right ? "border-green-500" : "border-red-400"}`}
            />
            {given === null && (
              <div className="mt-3 flex justify-between gap-2">
                <button type="button" onClick={() => answer("")} className="btn btn-ghost">
                  {t("dontKnow")}
                </button>
                <button disabled={!typed.trim()} className="btn btn-primary">
                  {t("check")}
                </button>
              </div>
            )}
          </form>
        )}

        {given !== null && !(q.kind !== "write" && right) && (
          <div className={`mt-4 rounded-2xl p-4 ${right ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
            <p className="font-semibold">{right ? t("right") : given ? t("wrong") : t("hereIs")}</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <b className="font-serif text-lg">{w.term}</b>
              {w.ipa && <span className="text-sm text-muted">{w.ipa}</span>}
              <span>{meaningOf(w)}</span>
            </p>
            {!right && <p className="mt-1 text-sm text-muted">{t("comesBack")}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => advance()} autoFocus className="btn btn-primary">
                {t("continue")} <I.IconEnter />
              </button>
              {q.kind === "write" && given && !right && (
                <button
                  onClick={() => {
                    setOverridden(true);
                    advance(true);
                  }}
                  className="btn btn-ghost"
                >
                  {t("override")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-between text-sm text-muted">
        <span>{t("round", { n: roundNo, left: queue.length })}</span>
        <button onClick={onExit} className="underline">
          {t("exit")}
        </button>
      </div>
    </div>
  );
}
