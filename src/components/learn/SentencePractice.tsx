"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { meaningOf, type PWord } from "@/components/practice/questions";
import { speak } from "@/lib/speech";
import * as I from "@/components/icons";

type Result = { score: 0 | 1 | 2; feedback: string; better: string };
const SCORE_STYLE = ["border-red-400 bg-red-50 dark:bg-red-950/30", "border-amber-400 bg-amber-50 dark:bg-amber-950/30", "border-green-500 bg-green-50 dark:bg-green-950/30"];

/** Write your own sentence with each word; AI grades it, suggests a better one, and it counts as a review. */
export default function SentencePractice({ words, onExit, onDone }: { words: PWord[]; onExit?: () => void; onDone?: () => void }) {
  const t = useTranslations("learn.sentence");
  const [i, setI] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [scores, setScores] = useState<number[]>([]);
  const box = useRef<HTMLTextAreaElement>(null);
  const w = words[i];

  async function check() {
    if (!w || text.trim().length < 2 || busy) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/learn/sentence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wordId: w.id, sentence: text.trim() }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setError(r?.status === 409 ? t("noAi") : t("failed"));
    const data = (await r.json()) as Result;
    setRes(data);
    setScores((s) => [...s, data.score]);
  }
  async function saveExample() {
    if (!w || !res) return;
    const r = await fetch(`/api/words/${w.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ example: res.better }) });
    if (r.ok) setSaved(true);
  }
  function next() {
    setRes(null);
    setText("");
    setSaved(false);
    setI((n) => n + 1);
    setTimeout(() => box.current?.focus(), 30);
  }

  if (!w) {
    const good = scores.filter((s) => s === 2).length;
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-8 text-center">
        <p className="text-4xl">✍️</p>
        <p className="mt-2 font-serif text-2xl font-bold">{t("done", { good, n: scores.length })}</p>
        <p className="mt-1 text-sm text-muted">{t("doneTip")}</p>
        <div className="mt-5 flex justify-center gap-2">
          {onDone ? (
            <button onClick={onDone} autoFocus className="btn btn-primary">
              {t("continue")}
            </button>
          ) : (
            <button onClick={onExit} className="btn btn-primary">
              {t("exit")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center gap-3 text-sm text-muted">
        <span className="tabular-nums">
          {i + 1}/{words.length}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/70">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(i / words.length) * 100}%` }} />
        </div>
        {onExit && (
          <button onClick={onExit} className="underline">
            {t("exit")}
          </button>
        )}
      </div>
      <div className="rounded-3xl border border-line bg-card p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent2">{t("ask")}</p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span className="font-serif text-3xl font-bold">{w.term}</span>
          {w.pos && <span className="text-sm font-semibold text-accent2">{w.pos}</span>}
          {w.ipa && <span className="text-muted">{w.ipa}</span>}
          <button onClick={() => speak(w.term)} aria-label={t("listen")}>
            <I.IconSpeaker className="inline-block h-4 w-4 align-[-0.2em]" />
          </button>
        </p>
        <p className="mt-1 text-muted">{meaningOf(w)}</p>
        <textarea
          ref={box}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (res) next();
              else check();
            }
          }}
          readOnly={!!res}
          rows={3}
          placeholder={t("placeholder", { term: w.term })}
          className="field mt-4 w-full py-3 text-base"
        />
        {!res && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={next} className="btn btn-ghost">
              {t("skip")}
            </button>
            <span className="flex-1 text-xs text-muted">{t("hint")}</span>
            <button onClick={check} disabled={busy || text.trim().length < 2} className="btn btn-primary">
              {busy ? t("checking") : t("check")}
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {res && (
          <div className={`mt-4 rounded-2xl border-2 p-4 ${SCORE_STYLE[res.score]}`}>
            <p className="font-semibold">{t(`score.${res.score}`)}</p>
            <p className="mt-1 text-sm">{res.feedback}</p>
            {res.better.trim() && res.better.trim() !== text.trim() && (
              <p className="mt-2 font-serif italic">
                <span className="not-italic text-xs font-semibold uppercase tracking-wide text-muted">{t("better")} </span>“{res.better}”
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={next} autoFocus className="btn btn-primary">
                {t("next")} ↵
              </button>
              {res.score > 0 && (
                <button onClick={saveExample} disabled={saved} className="btn btn-secondary">
                  {saved ? t("saved") : t("saveExample")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
