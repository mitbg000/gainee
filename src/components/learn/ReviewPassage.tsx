"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { speak } from "@/lib/speech";
import * as I from "@/components/icons";
import { sfx } from "@/lib/sound";

type Passage = {
  title: string;
  passage: string;
  questions: { q: string; answer: "T" | "F" | "NG"; explanation: string }[];
  words: { id: number; term: string; meaning: string }[];
};

/** Render "**word**" as a highlighted, clickable word that shows its meaning. */
function Text({ text, words }: { text: string; words: Passage["words"] }) {
  const [open, setOpen] = useState<string | null>(null);
  const meaningOf = (s: string) => {
    const l = s.toLowerCase();
    return words.find((w) => l.includes(w.term.toLowerCase()) || w.term.toLowerCase().includes(l.replace(/(ed|ing|es|s)$/, "")));
  };
  return (
    <>
      {text.split(/\n{2,}/).map((para, k) => (
        <p key={k} className="mb-4 font-serif text-[17px] leading-[1.85]">
          {para.split(/\*\*(.+?)\*\*/g).map((part, j) => {
            if (j % 2 === 0) return part;
            const key = `${k}-${j}`;
            const w = meaningOf(part);
            return (
              <span key={key} className="relative">
                <button onClick={() => setOpen(open === key ? null : key)} className="rounded bg-highlight/70 px-0.5 font-semibold text-ink underline decoration-accent/50 decoration-2 underline-offset-4">
                  {part}
                </button>
                {open === key && w && (
                  <span className="absolute left-0 top-full z-10 mt-1 w-max max-w-64 rounded-xl border border-line bg-card px-3 py-2 font-sans text-sm shadow-lg">
                    <b>{w.term}</b> – {w.meaning}
                  </span>
                )}
              </span>
            );
          })}
        </p>
      ))}
    </>
  );
}

/**
 * A short IELTS-style passage written by AI from the words you are about to forget, with True/False/Not Given questions.
 * At the end you mark which words you still remembered; that updates the review schedule.
 */
export default function ReviewPassage({ onExit, onDone }: { onExit?: () => void; onDone?: () => void }) {
  const t = useTranslations("learn.passage");
  const [p, setP] = useState<Passage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [forgot, setForgot] = useState<Set<number>>(new Set());
  const [finished, setFinished] = useState(false);

  const load = useCallback(async () => {
    setP(null);
    setError(null);
    setAnswers({});
    setForgot(new Set());
    setFinished(false);
    const r = await fetch("/api/learn/passage", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) {
      const code = r ? ((await r.json().catch(() => ({}))) as { error?: string }).error : null;
      return setError(code === "too_few_words" ? t("tooFew") : code === "ai_not_configured" ? t("noAi") : t("failed"));
    }
    setP(await r.json());
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  async function finish() {
    if (!p) return;
    await fetch("/api/learn/passage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ remembered: p.words.filter((w) => !forgot.has(w.id)).map((w) => w.id), forgot: [...forgot] }),
    }).catch(() => null);
    setFinished(true);
  }

  if (error)
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-8 text-center">
        <p className="text-muted">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={load} className="btn btn-primary">
            {t("retry")}
          </button>
          {(onExit || onDone) && (
            <button onClick={onDone ?? onExit} className="btn btn-secondary">
              {onDone ? t("skip") : t("exit")}
            </button>
          )}
        </div>
      </div>
    );
  if (!p)
    return (
      <div className="mx-auto max-w-2xl animate-pulse rounded-3xl border border-line bg-card p-8 text-center text-muted">
        <I.BigIcon icon={I.IconBook} />
        <p className="mt-2">{t("writing")}</p>
      </div>
    );

  const allAnswered = p.questions.every((_, k) => answers[k]);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <article className="rounded-3xl border border-line bg-card p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent2">{t("kicker", { n: p.words.length })}</p>
        <h2 className="mt-1 font-serif text-2xl font-bold">{p.title}</h2>
        <div className="mt-4">
          <Text text={p.passage} words={p.words} />
        </div>
      </article>

      <section className="rounded-3xl border border-line bg-card p-6">
        <h3 className="font-semibold">{t("questions")}</h3>
        <ol className="mt-3 space-y-4">
          {p.questions.map((q, k) => {
            const given = answers[k];
            return (
              <li key={k}>
                <p>
                  {k + 1}. {q.q}
                </p>
                <div className="mt-2 flex gap-2">
                  {(["T", "F", "NG"] as const).map((a) => {
                    const state = !given ? "border-line hover:border-accent" : a === q.answer ? "border-green-500 bg-green-50 dark:bg-green-950/40" : a === given ? "border-red-400 bg-red-50 dark:bg-red-950/40" : "border-line opacity-50";
                    return (
                      <button key={a} disabled={!!given} onClick={() => {
                          sfx(a === q.answer ? "correct" : "wrong");
                          setAnswers({ ...answers, [k]: a });
                        }} className={`min-h-10 rounded-xl border-2 px-3 text-sm font-semibold ${state}`}>
                        {t(`tfng.${a}`)}
                      </button>
                    );
                  })}
                </div>
                {given && <p className="mt-2 text-sm text-muted">{q.explanation}</p>}
              </li>
            );
          })}
        </ol>
      </section>

      {allAnswered && (
        <section className="rounded-3xl border border-line bg-card p-6">
          <h3 className="flex items-center gap-1.5 font-semibold">{finished && <I.IconCheckCircle className="h-5 w-5 text-green-600" />}{finished ? t("updated") : t("rememberTitle")}</h3>
          {!finished && <p className="mt-1 text-sm text-muted">{t("rememberHint")}</p>}
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {p.words.map((w) => {
              const lost = forgot.has(w.id);
              return (
                <li key={w.id}>
                  <button
                    disabled={finished}
                    onClick={() => {
                      const n = new Set(forgot);
                      if (lost) n.delete(w.id);
                      else n.add(w.id);
                      setForgot(n);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm ${lost ? "border-red-400 bg-red-50 dark:bg-red-950/30" : "border-green-500/60 bg-green-50 dark:bg-green-950/30"}`}
                  >
                    {lost ? <I.IconX className="h-4 w-4 flex-none text-red-600" /> : <I.IconCheck className="h-4 w-4 flex-none text-green-600" />}
                    <span className="min-w-0 flex-1">
                      <b>{w.term}</b> <span className="text-muted">– {w.meaning}</span>
                    </span>
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        speak(w.term);
                      }}
                      className="text-muted"
                    >
                      <I.IconSpeaker className="h-4 w-4" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {!finished ? (
              <button onClick={finish} className="btn btn-primary">
                {t("finish")}
              </button>
            ) : onDone ? (
              <button onClick={onDone} autoFocus className="btn btn-primary">
                {t("continue")}
              </button>
            ) : (
              <button onClick={load} className="btn btn-primary">
                {t("another")}
              </button>
            )}
            {onExit && (
              <button onClick={onExit} className="btn btn-secondary">
                {t("exit")}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
