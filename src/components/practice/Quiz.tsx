"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { speak } from "@/lib/speech";
import { buildQuestions, isRight, type Mode, type PWord, type Question } from "./questions";
import * as I from "@/components/icons";

/** Test: choose the meaning, choose the word, spell what you hear, or fill the sentence – scored, for the Progress chart. */
export default function Quiz({ words, all, mode, onExit }: { words: PWord[]; all: { term: string; meaning: string }[]; mode: Mode; onExit: () => void }) {
  const t = useTranslations("practice");
  const [qs, setQs] = useState<Question[]>(() => buildQuestions(words, all, mode, 0));
  const [i, setI] = useState(0);
  const [given, setGiven] = useState<string | null>(null); // the answer for the current question, once given
  const [typed, setTyped] = useState("");
  const [wrong, setWrong] = useState<PWord[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const q = qs?.[i];
  // a finished round is saved once for the score chart on the Progress page
  const posted = useRef<Question[] | null>(null);
  useEffect(() => {
    if (q || posted.current === qs) return;
    posted.current = qs;
    fetch("/api/practice/result", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ score: qs.length - wrong.length, total: qs.length, mode }) }).catch(() => {});
  }, [qs, q, wrong.length, mode]);
  useEffect(() => {
    if (!q) return;
    if (q.kind === "spell") speak(q.word.term);
    if (q.kind === "spell" || q.kind === "cloze") setTimeout(() => input.current?.focus(), 50);
  }, [q]);

  function start(list: PWord[]) {
    setQs(buildQuestions(list, all, mode, 0));
    setI(0);
    setGiven(null);
    setTyped("");
    setWrong([]);
  }
  function answer(a: string) {
    if (!q || given !== null) return;
    setGiven(a);
    if (!isRight(q, a)) setWrong((w) => [...w, q.word]);
    if (q.kind !== "spell") speak(q.word.term);
  }
  function next() {
    setGiven(null);
    setTyped("");
    setI((n) => n + 1);
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

  /* ---------- result ---------- */
  if (!q) {
    const score = qs.length - wrong.length;
    return (
      <div className="rounded-2xl border border-line bg-card p-5">
        <p className="font-serif text-3xl font-bold">
          {score}/{qs.length} {score === qs.length ? "🎉" : score >= qs.length * 0.7 ? "👍" : "💪"}
        </p>
        {wrong.length > 0 && (
          <>
            <p className="mt-4 text-sm font-semibold">{t("wrongList")}</p>
            <ul className="mt-2 space-y-1.5">
              {wrong.map((w, k) => (
                <li key={k} className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-paper px-3 py-2">
                  <b>{w.term}</b>
                  {w.ipa && <span className="text-sm text-muted">{w.ipa}</span>}
                  <span className="text-sm">{w.meaningVi || w.definitionEn}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {wrong.length > 0 && (
            <button onClick={() => start([...new Map(wrong.map((w) => [w.id, w])).values()])} className="btn btn-primary">
              ↻ {t("retryWrong")}
            </button>
          )}
          <button onClick={() => start(words)} className="btn btn-secondary">
            {t("again")}
          </button>
          <button onClick={onExit} className="btn btn-secondary">
            {t("change")}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- question ---------- */
  const right = given !== null && isRight(q, given);
  const w = q.word;
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="mb-4 flex items-center gap-3 text-sm text-muted">
        <span>
          {i + 1}/{qs.length}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
          <div className="h-full bg-accent transition-all" style={{ width: `${(i / qs.length) * 100}%` }} />
        </div>
        <button onClick={onExit} className="text-xs underline">
          {t("stop")}
        </button>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-accent2">{t(`ask.${q.kind}`)}</p>
      <div className="mt-2 min-h-16">
        {q.kind === "meaning" && (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-serif text-3xl font-bold">{w.term}</span>
            {w.pos && <span className="text-sm font-semibold text-accent2">{w.pos}</span>}
            {w.ipa && <span className="text-muted">{w.ipa}</span>}
            <button onClick={() => speak(w.term)} className="text-lg" aria-label={t("listen")}>
              <I.IconSpeaker className="inline-block h-4 w-4 align-[-0.2em]" />
            </button>
          </p>
        )}
        {q.kind === "term" && <p className="text-xl font-semibold">{w.meaningVi || w.definitionEn}</p>}
        {q.kind === "spell" && (
          <p className="flex items-center gap-3">
            <button onClick={() => speak(w.term)} className="flex h-14 w-14 items-center justify-center rounded-full border border-line text-2xl" aria-label={t("listen")}>
              <I.IconSpeaker className="h-7 w-7" />
            </button>
            <span className="text-muted">{w.meaningVi || w.definitionEn}</span>
          </p>
        )}
        {q.kind === "cloze" && <p className="font-serif text-xl leading-relaxed">{q.prompt}</p>}
      </div>

      {q.options ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {q.options.map((o, k) => {
            const state = given === null ? "" : isRight(q, o) ? "border-green-500 bg-green-50 dark:bg-green-950/40" : o === given ? "border-red-400 bg-red-50 dark:bg-red-950/40" : "opacity-60";
            return (
              <button key={k} disabled={given !== null} onClick={() => answer(o)} className={`flex min-h-12 items-center gap-2 rounded-xl border border-line px-3 text-left ${state || "hover:border-accent"}`}>
                <span className="text-xs text-muted">{k + 1}</span>
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
            className={`min-h-12 flex-1 rounded-xl border bg-paper px-3 text-lg outline-none ${given === null ? "border-line focus:border-accent" : right ? "border-green-500" : "border-red-400"}`}
          />
          {given === null && (
            <button disabled={!typed.trim()} className="btn btn-lg btn-primary">
              {t("check")}
            </button>
          )}
        </form>
      )}

      {given !== null && (
        <div className="mt-4 rounded-xl bg-paper p-3">
          <p className="font-semibold">{right ? `✅ ${t("right")}` : `❌ ${t("answerIs")}`}</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <b className="font-serif text-lg">{w.term}</b>
            {w.ipa && <span className="text-sm text-muted">{w.ipa}</span>}
            <span>{w.meaningVi || w.definitionEn}</span>
          </p>
          {w.context && <p className="mt-1 font-serif text-[15px] italic text-muted">“{w.context}”</p>}
          <button onClick={next} autoFocus className="btn btn-primary mt-3">
            {t("next")} ↵
          </button>
        </div>
      )}
    </div>
  );
}
