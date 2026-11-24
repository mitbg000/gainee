"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { autoSpeak } from "@/lib/speech";
import { meaningOf, norm, options, shuffle, type PWord } from "./questions";
import * as I from "@/components/icons";
import { sfx } from "@/lib/sound";

type Q = { w: PWord; img: string; options: string[] | null };

/**
 * Look at the picture, name the word: picking from 4 words first, then (on the second round) typing it.
 * Pictures tie a word to an image in memory – one of the strongest memory aids.
 */
export default function PicturePractice({ words, all, onExit }: { words: PWord[]; all: { term: string }[]; onExit: () => void }) {
  const t = useTranslations("practice.picture");
  const withImg = words.filter((w) => w.images?.length);
  // 4 choices from all saved words; typing when there are too few different words
  const build = (list: PWord[], typing: boolean): Q[] =>
    shuffle(list.filter((w) => w.images?.length)).map((w) => ({ w, img: shuffle(w.images!)[0].url, options: typing ? null : options(w.term, all.map((x) => x.term)) }));
  const [typing, setTyping] = useState(false);
  const [qs, setQs] = useState<Q[]>(() => build(withImg, false));
  const [i, setI] = useState(0);
  const [given, setGiven] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [wrong, setWrong] = useState<PWord[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const q = qs[i];
  const right = q && given !== null && norm(given) === norm(q.w.term);

  useEffect(() => {
    if (q && !q.options && given === null) setTimeout(() => input.current?.focus(), 30);
  }, [q, given]);

  function answer(a: string) {
    if (!q || given !== null) return;
    setGiven(a);
    autoSpeak(q.w.term);
    const ok = norm(a) === norm(q.w.term);
    sfx(ok ? "correct" : "wrong");
    if (!ok) setWrong((ws) => [...ws, q.w]);
    if (i === qs.length - 1) setTimeout(() => sfx("done"), 400);
  }
  function next() {
    setGiven(null);
    setTyped("");
    setI((n) => n + 1);
  }
  function restart(list: PWord[], asTyping: boolean) {
    setTyping(asTyping);
    setQs(build(list, asTyping));
    setI(0);
    setGiven(null);
    setTyped("");
    setWrong([]);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q) return;
      if (given !== null && e.key === "Enter") return (e.preventDefault(), next());
      if (given === null && q.options && /^[1-4]$/.test(e.key) && !(e.target as HTMLElement).closest("input")) answer(q.options[Number(e.key) - 1] ?? "");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!withImg.length)
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-8 text-center">
        <I.BigIcon icon={I.IconImage} />
        <p className="mt-3 text-muted">{t("none")}</p>
        <button onClick={onExit} className="btn btn-primary mt-4">
          {t("exit")}
        </button>
      </div>
    );

  if (!q) {
    const score = qs.length - wrong.length;
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-8 text-center">
        <I.BigIcon icon={score === qs.length ? I.IconTrophy : I.IconImage} tone={score === qs.length ? "amber" : "accent"} />
        <p className="mt-3 font-serif text-3xl font-bold">
          {score}/{qs.length}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {wrong.length > 0 && (
            <button onClick={() => restart(wrong, typing)} className="btn btn-primary">
              <I.IconRefresh /> {t("retryWrong")}
            </button>
          )}
          {!typing && (
            <button onClick={() => restart(withImg, true)} className={`btn ${wrong.length ? "btn-secondary" : "btn-primary"}`}>
              {t("typingRound")}
            </button>
          )}
          <button onClick={onExit} className="btn btn-secondary">
            {t("exit")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center gap-3 text-sm text-muted">
        <span className="tabular-nums">
          {i + 1}/{qs.length}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/70">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(i / qs.length) * 100}%` }} />
        </div>
        <button onClick={onExit} className="underline">
          {t("exit")}
        </button>
      </div>
      <div className="rounded-3xl border border-line bg-card p-5 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent2">{q.options ? t("askChoose") : t("askType")}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={q.img} alt="" className="mx-auto mt-3 max-h-72 w-full rounded-2xl bg-paper object-contain" />
        {q.options ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {q.options.map((o, k) => {
              const ok = norm(o) === norm(q.w.term);
              const state = given === null ? "hover:border-accent" : ok ? "border-green-500 bg-green-50 dark:bg-green-950/40" : o === given ? "border-red-400 bg-red-50 dark:bg-red-950/40" : "opacity-50";
              return (
                <button key={k} disabled={given !== null} onClick={() => answer(o)} className={`flex min-h-12 items-center gap-3 rounded-2xl border-2 border-line px-4 text-left font-semibold ${state}`}>
                  <span className="flex size-6 flex-none items-center justify-center rounded-full bg-paper text-xs font-normal text-muted">{k + 1}</span>
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
              else next();
            }}
            className="mt-4 flex gap-2"
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
              className={`min-h-12 flex-1 rounded-xl border-2 bg-paper px-3 text-lg outline-none ${given === null ? "border-line focus:border-accent" : right ? "border-green-500" : "border-red-400"}`}
            />
            {given === null && (
              <button disabled={!typed.trim()} className="btn btn-lg btn-primary">
                {t("check")}
              </button>
            )}
          </form>
        )}
        {given !== null && (
          <div className="mt-4 rounded-2xl bg-paper p-4">
            <p className="flex items-center gap-1.5 font-semibold">
              {right ? <I.IconCheckCircle className="h-5 w-5 text-green-600" /> : <I.IconXCircle className="h-5 w-5 text-red-600" />}
              {right ? t("right") : t("answerIs")}
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <b className="font-serif text-lg">{q.w.term}</b>
              {q.w.ipa && <span className="text-sm text-muted">{q.w.ipa}</span>}
              <span>{meaningOf(q.w)}</span>
            </p>
            <button onClick={next} autoFocus className="btn btn-primary mt-3">
              {t("next")} <I.IconEnter />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
