"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { clozeOf, meaningOf, norm, shuffle, type PWord } from "@/components/practice/questions";
import * as I from "@/components/icons";
import { autoSpeak, speak } from "@/lib/speech";
import { sfx } from "@/lib/sound";
import { nextKind, ratingOf, wordDone, type Kind, type Progress } from "./quickRules";

export type QWord = PWord & { state: number; stability: number; example: string | null };
type Other = { term: string; pos: string | null; meaningVi: string | null; definitionEn: string | null };
type Q = { n: number; w: QWord; kind: Kind; prompt: string; options: string[]; answer: string };
type Answered = { q: Q; given: string; right: boolean };

const LOG_MODE: Record<Kind, string> = { meaning: "recognize", term: "recognize", cloze: "cloze", listen: "listen", type: "recall" };
const DAY = 24 * 3600_000;

/** The word blanked in its saved sentence, or in the example. */
function sentenceOf(w: QWord): string | null {
  return clozeOf(w) ?? (w.example ? clozeOf({ ...w, context: w.example }) : null);
}

/** `n` choices: the right one and others, of the same part of speech when there are enough. */
function choices(right: string, pool: { value: string; pos: string | null }[], pos: string | null, n: number) {
  const seen = new Set([norm(right)]);
  const uniq = shuffle(pool).filter((x) => x.value && !seen.has(norm(x.value)) && seen.add(norm(x.value)));
  const same = uniq.filter((x) => pos && x.pos === pos);
  const wrong = [...same, ...uniq.filter((x) => !same.includes(x))].slice(0, n - 1).map((x) => x.value);
  return shuffle([right, ...wrong]);
}

/**
 * One quick round, "learn" (new words) or "review" (words due): questions of mixed kinds, a word comes back until it is
 * known (two right answers in a row, of two kinds, one of them recalling the word), and FSRS is told how it went.
 */
export default function QuickMix({ kind, words, others, onDone, doneLabel }: { kind: "learn" | "review"; words: QWord[]; others: Other[]; onDone: () => void; doneLabel: string }) {
  const t = useTranslations("learn.quick");
  const all = [...words, ...others];
  const termPool = all.map((w) => ({ value: w.term, pos: w.pos }));
  const meaningPool = all.map((w) => ({ value: meaningOf(w), pos: w.pos }));
  const stage = (w: QWord) => (kind === "learn" || w.state !== 2 || w.stability < 3 ? 0 : w.stability < 21 ? 1 : 2);

  const [progress, setProgress] = useState<Record<number, Progress>>({});
  const [queue, setQueue] = useState<number[]>(() => shuffle(words).map((w) => w.id));
  const [cur, setCur] = useState<Q | null>(null);
  const [given, setGiven] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [history, setHistory] = useState<Answered[]>([]);
  const [view, setView] = useState<number | null>(null); // looking back at an answered question
  const [due, setDue] = useState<Record<number, number>>({}); // word → ms until next review, once graded
  const [ended, setEnded] = useState(false);
  const shownAt = useRef(Date.now());
  const auto = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seq = useRef(0);

  function ask(w: QWord, p: Progress | undefined): Q {
    const k = nextKind(p, stage(w), !!sentenceOf(w));
    const base = { n: ++seq.current, w, kind: k };
    if (k === "meaning") return { ...base, prompt: w.term, options: choices(meaningOf(w), meaningPool, w.pos, 4), answer: meaningOf(w) };
    if (k === "cloze") return { ...base, prompt: sentenceOf(w)!, options: choices(w.term, termPool, w.pos, 6), answer: w.term };
    if (k === "type") return { ...base, prompt: meaningOf(w), options: [], answer: w.term };
    return { ...base, prompt: k === "term" ? meaningOf(w) : "", options: choices(w.term, termPool, w.pos, 4), answer: w.term };
  }
  const byId = (id: number) => words.find((w) => w.id === id)!;

  // the first question
  useEffect(() => {
    if (!cur && queue.length && !ended) show(queue, progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function show(q: number[], p: Record<number, Progress>) {
    clearTimeout(auto.current);
    setGiven(null);
    setTyped("");
    if (!q.length) return finish(p);
    const next = ask(byId(q[0]), p[q[0]]);
    setCur(next);
    shownAt.current = Date.now();
    if (next.kind === "listen") speak(next.w.term);
    else if (next.kind === "meaning") autoSpeak(next.w.term);
  }

  async function grade(w: QWord, p: Progress) {
    const r = await fetch(`/api/review/${w.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: ratingOf(p, stage(w)), mode: LOG_MODE[p.first!.kind], durationMs: Math.min(p.first!.ms, 3_600_000) }),
    }).catch(() => null);
    const d = r?.ok ? ((await r.json()) as { due: string }) : null;
    if (d) setDue((x) => ({ ...x, [w.id]: new Date(d.due).getTime() - Date.now() }));
  }

  function answer(a: string) {
    if (!cur || given !== null) return;
    const ms = Date.now() - shownAt.current;
    const right = norm(a) === norm(cur.answer) || (cur.kind === "type" && !!cur.w.context && new RegExp(`^${norm(cur.answer)}\\p{L}{0,3}$`, "u").test(norm(a)));
    setGiven(a);
    sfx(right ? "correct" : "wrong");
    if (cur.kind !== "meaning" && cur.kind !== "listen") autoSpeak(cur.w.term);
    const old = progress[cur.w.id];
    const p: Progress = {
      first: old?.first ?? { kind: cur.kind, ms, right },
      wrong: (old?.wrong ?? false) || !right,
      streak: right ? [...(old?.streak ?? []), cur.kind] : [],
      lastWrong: !right,
      graded: old?.graded ?? false,
    };
    if (wordDone(p) && !p.graded) {
      p.graded = true;
      void grade(cur.w, p);
    }
    const next = { ...progress, [cur.w.id]: p };
    setProgress(next);
    setHistory((h) => [...h, { q: cur, given: a, right }]);
    // a word not known yet comes back after a few other questions
    const rest = queue.slice(1);
    const q = wordDone(p) ? rest : [...rest.slice(0, right ? 3 : 2), cur.w.id, ...rest.slice(right ? 3 : 2)];
    setQueue(q);
    if (right) auto.current = setTimeout(() => show(q, next), 900);
  }

  /** Next question: after an answer, the one waiting; before one, this word goes back a few places (skipped). */
  function forward() {
    if (view !== null) return setView(view + 1 < history.length ? view + 1 : null);
    if (given !== null) return show(queue, progress);
    if (!cur) return;
    const rest = queue.slice(1);
    const q = rest.length ? [...rest.slice(0, 3), cur.w.id, ...rest.slice(3)] : queue;
    setQueue(q);
    show(q, progress);
  }
  const back = () => history.length && setView(view === null ? history.length - 1 : Math.max(0, view - 1));

  function finish(p = progress) {
    clearTimeout(auto.current);
    // words answered but not yet known are graded too: a wrong answer is worth knowing about
    for (const w of words) {
      const x = p[w.id];
      if (x?.first && !x.graded) void grade(w, { ...x, graded: true });
    }
    setEnded(true);
    sfx("done");
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ended || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") back();
      else if (e.key === "ArrowRight" || (e.key === "Enter" && given !== null)) forward();
      else if (view === null && given === null && cur && /^[1-6]$/.test(e.key)) {
        const o = cur.options[Number(e.key) - 1];
        if (o) answer(o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const known = words.filter((w) => progress[w.id] && wordDone(progress[w.id])).length;

  /* ---------- end of the round ---------- */
  if (ended) {
    const times = Object.values(due);
    const learned = times.filter((ms) => ms >= 21 * DAY).length;
    const buckets = [
      [t("soon.today"), times.filter((ms) => ms < DAY).length],
      [t("soon.week"), times.filter((ms) => ms >= DAY && ms < 7 * DAY).length],
      [t("soon.later"), times.filter((ms) => ms >= 7 * DAY).length],
    ] as const;
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-8 text-center">
        <I.BigIcon icon={I.IconTrophy} tone="amber" />
        <p className="mt-3 font-serif text-2xl font-bold">{t("roundDone", { n: Object.values(progress).filter((x) => x.first).length })}</p>
        {learned > 0 && <p className="mt-1 text-sm text-muted">{t("learnedNow", { n: learned })}</p>}
        <div className="mx-auto mt-5 grid max-w-md grid-cols-3 gap-2">
          {buckets.map(([label, n]) => (
            <div key={label} className="rounded-2xl bg-paper p-3">
              <p className="text-xl font-bold tabular-nums">{n}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{t("soon.hint")}</p>
        <button onClick={onDone} autoFocus className="btn btn-primary mt-6">
          {doneLabel} <I.IconArrowRight />
        </button>
      </div>
    );
  }

  const item = view !== null ? history[view] : null;
  const q = item?.q ?? cur;
  const shownGiven = item ? item.given : given;
  if (!q) return null;
  const isRight = (o: string) => norm(o) === norm(q.answer);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center gap-3 text-sm">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line/70">
          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${(known / words.length) * 100}%` }} />
        </div>
        <span className="tabular-nums text-muted">{t("known", { n: known, total: words.length })}</span>
        <button onClick={() => finish()} className="btn btn-sm btn-ghost">
          {t("stop")}
        </button>
      </div>

      <div className={`rounded-3xl border bg-card p-6 md:p-8 ${item ? "border-dashed border-line opacity-90" : "border-line"}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {item ? t("lookingBack") : t(`kind.${q.kind}`)}
        </p>

        {q.kind === "meaning" && (
          <p className="mt-3 flex items-center gap-2 font-serif text-3xl font-bold">
            {q.w.term}
            {q.w.ipa && <span className="font-sans text-base font-normal text-muted">{q.w.ipa}</span>}
            <button onClick={() => speak(q.w.term)} className="icon-btn" aria-label={t("listen")}>
              <I.IconSpeaker />
            </button>
          </p>
        )}
        {(q.kind === "term" || q.kind === "type") && <p className="mt-3 text-xl font-semibold">{q.prompt}</p>}
        {q.kind === "type" && sentenceOf(q.w) && <p className="mt-2 text-muted">{sentenceOf(q.w)}</p>}
        {q.kind === "cloze" && <p className="mt-3 text-xl leading-relaxed">{q.prompt}</p>}
        {q.kind === "listen" && (
          <button onClick={() => speak(q.w.term)} className="mx-auto mt-3 flex size-20 items-center justify-center rounded-full border border-line hover:border-accent" aria-label={t("listen")}>
            <I.IconSpeaker className="h-8 w-8" />
          </button>
        )}

        {q.kind === "type" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) answer(typed);
            }}
            className="mt-5"
          >
            <input
              value={shownGiven ?? typed}
              onChange={(e) => setTyped(e.target.value)}
              readOnly={shownGiven !== null}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              placeholder={t("typeHint", { first: q.answer[0] })}
              className={`field w-full text-lg ${shownGiven === null ? "" : isRight(shownGiven) ? "border-green-500" : "border-red-500"}`}
            />
            {shownGiven === null && (
              <div className="mt-3 flex gap-2">
                <button type="submit" className="btn btn-primary" disabled={!typed.trim()}>
                  {t("check")}
                </button>
                <button type="button" onClick={() => answer("")} className="btn btn-ghost">
                  {t("dontKnow")}
                </button>
              </div>
            )}
          </form>
        ) : (
          <div className={`mt-5 grid gap-2 ${q.kind === "cloze" ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {q.options.map((o, k) => {
              const state = shownGiven === null ? "" : isRight(o) ? "border-green-500 bg-green-50 dark:bg-green-950/40" : o === shownGiven ? "border-red-500 bg-red-50 dark:bg-red-950/40" : "opacity-60";
              return (
                <button key={o} onClick={() => answer(o)} disabled={shownGiven !== null} className={`flex items-center gap-2 rounded-2xl border border-line px-4 py-3 text-left hover:border-accent ${state}`}>
                  <span className="text-xs text-muted">{k + 1}</span>
                  <span className="min-w-0 flex-1">{o}</span>
                </button>
              );
            })}
          </div>
        )}

        {shownGiven !== null && (
          <div className={`mt-4 rounded-2xl p-3 text-sm ${isRight(shownGiven) ? "bg-green-50 text-green-900 dark:bg-green-950/40 dark:text-green-200" : "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200"}`}>
            <b>{isRight(shownGiven) ? t("right") : t("wrongWas")}</b>{" "}
            <span className="font-semibold">{q.w.term}</span>
            {q.w.ipa && <span className="text-muted"> {q.w.ipa}</span>} – {meaningOf(q.w)}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button onClick={back} disabled={!history.length || view === 0} className="btn btn-secondary">
          <I.IconArrowLeft /> {t("prev")}
        </button>
        <button onClick={forward} className={`btn ${shownGiven !== null || view !== null ? "btn-primary" : "btn-secondary"}`}>
          {view !== null ? t("next") : given !== null ? t("next") : t("skip")} <I.IconArrowRight />
        </button>
      </div>
    </div>
  );
}
