"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type { LessonContent } from "@/lib/lessons/generate";
import Markdown from "./Markdown";
import type { LessonData, Vocab } from "./types";
import { useAiAsk } from "./useAiAsk";
import { speak } from "@/lib/speech";
import * as I from "@/components/icons";

/* =================================================================== vocabulary */
export type TermWord = {
  id: number;
  term: string;
  ipa: string | null;
  pos: string | null;
  meaningVi: string | null;
  definitionEn: string | null;
  example: string | null;
  note: string | null;
  context: string | null;
};

export function VocabPane({
  vocab,
  saved,
  onToggleSave,
  onSaveAll,
  termWords,
  onRemoveTerm,
}: {
  vocab: Vocab[];
  saved: Record<number, number>;
  onToggleSave: (id: number) => void;
  onSaveAll: () => void;
  termWords: TermWord[];
  onRemoveTerm: (w: TermWord) => void;
}) {
  const t = useTranslations("lesson.vocab");
  const [hide, setHide] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => (setHide(!hide), setShown(new Set()))} className={`min-h-10 rounded-xl border px-3 text-sm ${hide ? "border-ink bg-ink text-paper" : "border-line"}`}>
          <I.IconEyeOff className="inline-block h-4 w-4 align-[-0.2em]" /> {t("hide")}
        </button>
        <button onClick={onSaveAll} className="min-h-10 rounded-xl border border-line px-3 text-sm">
          <I.IconStar className="inline-block h-4 w-4 align-[-0.2em]" /> {t("saveAll")}
        </button>
        <span className="ml-auto text-sm text-muted">{t("count", { n: vocab.length })}</span>
      </div>
      <ul className="space-y-2.5">
        {vocab.map((v) => {
          const blur = hide && !shown.has(v.id);
          return (
            <li key={v.id} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-serif text-xl font-bold">{v.headword}</span>
                    {v.pos && <span className="text-sm font-semibold text-accent2">{v.pos}</span>}
                    {v.ipa && <span className="text-sm text-muted">{v.ipa}</span>}
                    {v.cefr && <span className="rounded bg-paper px-1 text-[11px] text-muted">{v.cefr}</span>}
                  </div>
                  <button
                    onClick={() => setShown((s) => new Set(s).add(v.id))}
                    className={`mt-1 block text-left transition ${blur ? "select-none blur-sm" : ""}`}
                    aria-label={t("reveal")}
                  >
                    <span className="font-semibold text-accent">{v.meaningVi}</span>
                    {v.definitionEn && <span className="block text-sm text-muted">{v.definitionEn}</span>}
                  </button>
                </div>
                <button onClick={() => speak(v.headword)} className="rounded-lg border border-line px-2 py-1" aria-label={t("listen")}>
                  <I.IconSpeaker className="inline-block h-4 w-4 align-[-0.2em]" />
                </button>
                <button
                  onClick={() => onToggleSave(v.id)}
                  className={`rounded-lg border px-2 py-1 ${saved[v.id] ? "border-amber-400 bg-amber-50 dark:bg-amber-950" : "border-line"}`}
                  aria-label={t("save")}
                >
                  <I.IconStar className={`h-4 w-4 ${saved[v.id] ? "fill-current text-amber-500" : ""}`} />
                </button>
              </div>
              {v.context && <p className="mt-2 rounded-lg bg-paper px-3 py-2 font-serif text-[15px]">“{v.context}”</p>}
              {v.example && <p className="mt-2 text-sm italic"><I.IconQuote className="inline-block h-4 w-4 align-[-0.2em] text-muted" /> {v.example}</p>}
              {v.note && <p className="mt-1 text-sm text-muted"><I.IconBulb className="inline-block h-4 w-4 align-[-0.2em]" /> {v.note}</p>}
            </li>
          );
        })}
      </ul>

      {termWords.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent2">{t("mine", { n: termWords.length })}</h3>
          <ul className="space-y-2.5">
            {termWords.map((w) => (
              <li key={w.id} className="flex items-start gap-2 rounded-2xl border border-line bg-card p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-serif text-xl font-bold">{w.term}</span>
                    {w.pos && <span className="text-sm font-semibold text-accent2">{w.pos}</span>}
                    {w.ipa && <span className="text-sm text-muted">{w.ipa}</span>}
                  </div>
                  {w.meaningVi && <div className="font-semibold text-accent">{w.meaningVi}</div>}
                  {w.definitionEn && <div className="text-sm text-muted">{w.definitionEn}</div>}
                  {w.context && <p className="mt-1 rounded-lg bg-paper px-3 py-2 font-serif text-[15px]">“{w.context}”</p>}
                </div>
                <button onClick={() => speak(w.term)} className="rounded-lg border border-line px-2 py-1" aria-label={t("listen")}>
                  <I.IconSpeaker className="inline-block h-4 w-4 align-[-0.2em]" />
                </button>
                <button onClick={() => onRemoveTerm(w)} className="rounded-lg border border-amber-400 bg-amber-50 px-2 py-1 dark:bg-amber-950" aria-label={t("save")}>
                  <I.IconStar className="inline-block h-4 w-4 align-[-0.2em] fill-current text-amber-500" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* =================================================================== exercises */
type Draft = { total: number; tf: Record<number, string>; mc: Record<number, number>; gp: Record<number, string>; result: { score: number; total: number; at: string } | null };
type Answer = { qtype: "tfng" | "mcq" | "gap"; correct: boolean; given: string; expected: string };
const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().replace(/[.!,;]+$/, "");

export function ExercisesPane({
  lessonId,
  content,
  vocab,
  bestScore,
  lastAttempt,
  onLocate,
  onScored,
}: {
  lessonId: number;
  content: LessonContent;
  vocab: Vocab[];
  bestScore: number | null;
  lastAttempt: LessonData["lastAttempt"];
  onLocate: (quote: string) => void;
  onScored: (pct: number) => void;
}) {
  const t = useTranslations("lesson.ex");
  const total = content.tfng.length + content.mcq.length + content.gaps.length;
  const draftKey = `ex_${lessonId}`;
  // Restore: the draft in this browser first, else the last submitted attempt from the server.
  const [init] = useState<Draft>(() => {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) ?? "null") as Draft | null;
      if (d && d.total === total) return d; // shortcut: matched by question count only; a regenerated set of the same size keeps old answers until "Try again"
    } catch {}
    const empty: Draft = { total, tf: {}, mc: {}, gp: {}, result: null };
    if (!lastAttempt || lastAttempt.total !== total) return empty; // questions were regenerated since
    const g = lastAttempt.given;
    const [nt, nm] = [content.tfng.length, content.mcq.length];
    content.tfng.forEach((_, i) => g[i] && (empty.tf[i] = g[i]));
    content.mcq.forEach((_, i) => g[nt + i] !== "" && g[nt + i] != null && (empty.mc[i] = Number(g[nt + i])));
    content.gaps.forEach((_, i) => g[nt + nm + i] && (empty.gp[i] = g[nt + nm + i]));
    return { ...empty, result: { score: lastAttempt.score, total, at: String(lastAttempt.createdAt) } };
  });
  const [tf, setTf] = useState<Record<number, string>>(init.tf);
  const [mc, setMc] = useState<Record<number, number>>(init.mc);
  const [gp, setGp] = useState<Record<number, string>>(init.gp);
  const [result, setResult] = useState(init.result);
  const checked = !!result;
  const [startedAt] = useState(Date.now());
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ total, tf, mc, gp, result } satisfies Draft));
    } catch {}
  }, [draftKey, total, tf, mc, gp, result]);

  const answers = useMemo<Answer[]>(
    () => [
      ...content.tfng.map((q, i) => ({ qtype: "tfng" as const, correct: tf[i] === q.answer, given: tf[i] ?? "", expected: q.answer })),
      ...content.mcq.map((q, i) => ({ qtype: "mcq" as const, correct: mc[i] === q.answer, given: String(mc[i] ?? ""), expected: String(q.answer) })),
      ...content.gaps.map((q, i) => ({ qtype: "gap" as const, correct: q.answers.some((a) => norm(a) === norm(gp[i] ?? "")), given: gp[i] ?? "", expected: q.answers.join(" / ") })),
    ],
    [content, tf, mc, gp],
  );

  async function submit() {
    const score = answers.filter((a) => a.correct).length;
    setResult({ score, total: answers.length, at: new Date().toISOString() });
    const r = await fetch(`/api/lessons/${lessonId}/attempt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers, durationSec: Math.round((Date.now() - startedAt) / 1000) }),
    });
    if (r.ok) onScored((await r.json()).best);
  }
  function reset() {
    setTf({});
    setMc({});
    setGp({});
    setResult(null);
  }

  const box = (ok: boolean) => (checked ? (ok ? "border-green-400 bg-green-50 dark:border-green-800 dark:bg-green-950/40" : "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40") : "border-line bg-card");
  const Evidence = ({ quote }: { quote?: string | null }) =>
    quote ? (
      <button onClick={() => onLocate(quote)} className="mt-1 block text-left text-sm text-accent underline decoration-dotted">
        <I.IconMapPin className="inline-block h-4 w-4 align-[-0.2em]" /> {t("showInText")}
      </button>
    ) : null;
  let n = 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-card p-3 text-sm text-muted">{t("tip")}</div>

      {content.tfng.length > 0 && (
        <section>
          <h3 className="mb-2 font-serif text-lg font-bold">{t("tfng")}</h3>
          <div className="space-y-2.5">
            {content.tfng.map((q, i) => {
              const a = answers[i];
              return (
                <div key={i} className={`rounded-2xl border p-4 ${box(a.correct)}`}>
                  <p className="font-medium">
                    <span className="mr-1 text-accent2">{++n}.</span>
                    {q.q}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["T", "F", "NG"] as const).map((o) => (
                      <button
                        key={o}
                        disabled={checked}
                        onClick={() => setTf((s) => ({ ...s, [i]: o }))}
                        className={`min-h-10 rounded-xl border px-4 text-sm ${tf[i] === o ? "border-accent bg-accent text-on-accent" : "border-line bg-card"}`}
                      >
                        {t(`tf.${o}`)}
                      </button>
                    ))}
                  </div>
                  {checked && (
                    <div className="mt-2 text-sm">
                      <b>{a.correct ? "✅" : "❌"} {t("answer")}: {t(`tf.${q.answer}`)}</b> — {q.explanation}
                      {q.evidence && <p className="mt-1 font-serif italic text-muted">“{q.evidence}”</p>}
                      <Evidence quote={q.evidence} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {content.mcq.length > 0 && (
        <section>
          <h3 className="mb-2 font-serif text-lg font-bold">{t("mcq")}</h3>
          <div className="space-y-2.5">
            {content.mcq.map((q, i) => {
              const a = answers[content.tfng.length + i];
              return (
                <div key={i} className={`rounded-2xl border p-4 ${box(a.correct)}`}>
                  <p className="font-medium">
                    <span className="mr-1 text-accent2">{++n}.</span>
                    {q.q}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {q.options.map((o, j) => (
                      <button
                        key={j}
                        disabled={checked}
                        onClick={() => setMc((s) => ({ ...s, [i]: j }))}
                        className={`flex min-h-10 w-full items-center gap-2 rounded-xl border px-3 text-left text-sm ${mc[i] === j ? "border-accent bg-accent/10" : "border-line bg-card"} ${checked && j === q.answer ? "font-semibold" : ""}`}
                      >
                        <b>{"ABCD"[j]}</b> {o}
                      </button>
                    ))}
                  </div>
                  {checked && (
                    <div className="mt-2 text-sm">
                      <b>{a.correct ? "✅" : "❌"} {t("answer")}: {"ABCD"[q.answer]}</b> — {q.explanation}
                      <Evidence quote={q.evidence} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {content.gaps.length > 0 && (
        <section>
          <h3 className="mb-1 font-serif text-lg font-bold">{t("gaps")}</h3>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {vocab.map((v) => (
              <span key={v.id} className="rounded-md bg-card px-2 py-0.5 text-sm text-muted">
                {v.headword}
              </span>
            ))}
          </div>
          <div className="space-y-2.5">
            {content.gaps.map((q, i) => {
              const a = answers[content.tfng.length + content.mcq.length + i];
              const [before, ...rest] = q.sentence.split(/_{3,}/);
              return (
                <div key={i} className={`rounded-2xl border p-4 ${box(a.correct)}`}>
                  <p className="leading-loose">
                    <span className="mr-1 text-accent2">{++n}.</span>
                    {before}
                    <input
                      value={gp[i] ?? ""}
                      disabled={checked}
                      onChange={(e) => setGp((s) => ({ ...s, [i]: e.target.value }))}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="mx-1 w-36 border-b-2 border-line bg-transparent px-1 text-center text-base font-semibold outline-none focus:border-accent"
                    />
                    {rest.join("____")}
                  </p>
                  {checked && <p className="mt-1 text-sm">{a.correct ? "✅" : "❌"} {t("answer")}: <b>{q.answers.join(" / ")}</b></p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!checked ? (
          <button onClick={submit} className="min-h-11 rounded-xl bg-accent px-5 font-medium text-on-accent">
            {t("submit")}
          </button>
        ) : (
          <button onClick={reset} className="min-h-11 rounded-xl border border-line px-5">
            {t("retry")}
          </button>
        )}
        {result && (
          <span className="text-lg font-bold">
            {result.score}/{result.total} {result.score === result.total ? "🎉" : result.score >= result.total * 0.7 ? "👍" : "💪"}
          </span>
        )}
        {result && <span className="text-sm text-muted">{t("doneAt", { date: new Date(result.at).toLocaleString() })}</span>}
        {bestScore != null && <span className="ml-auto text-sm text-muted">{t("best", { n: bestScore })}</span>}
      </div>
    </div>
  );
}

/* =================================================================== practice */
function useAutoSaveText({ lessonId, kind, prompt, initial, placeholder, rows = 4 }: { lessonId: number; kind: "paraphrase" | "speaking" | "task2"; prompt: string; initial: string; placeholder: string; rows?: number }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  useEffect(() => {
    if (v === saved) return;
    const id = setTimeout(async () => {
      await fetch(`/api/lessons/${lessonId}/writing`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, prompt, body: v }) });
      setSaved(v);
    }, 900);
    return () => clearTimeout(id);
  }, [v, saved, lessonId, kind, prompt]);
  return { value: v, el: <textarea value={v} onChange={(e) => setV(e.target.value)} rows={rows} placeholder={placeholder} className="w-full rounded-xl border border-line bg-card p-3 text-base leading-relaxed outline-none focus:border-accent" /> };
}

function Feedback({ lessonId, kind, prompt, answer }: { lessonId: number; kind: string; prompt: string; answer: string }) {
  const t = useTranslations("lesson.practice");
  const ai = useAiAsk();
  return (
    <div className="mt-2">
      <button
        disabled={!answer.trim() || ai.loading}
        onClick={() => ai.ask({ action: "feedback", selection: answer, prompt, feedbackKind: kind, lessonId })}
        className="min-h-10 rounded-xl border border-accent px-3 text-sm font-medium text-accent disabled:opacity-40"
      >
        <I.IconSpark className="inline-block h-4 w-4 align-[-0.2em]" /> {ai.loading ? t("checking") : t("feedback")}
      </button>
      {ai.notConfigured && <p className="mt-2 text-sm text-muted">{t("notConfigured")}</p>}
      {ai.text && <Markdown text={ai.text} className="mt-2 rounded-xl border border-line bg-card p-3 text-[15px] leading-relaxed" />}
    </div>
  );
}

export function PracticePane({
  lessonId,
  content,
  writings,
  notes,
}: {
  lessonId: number;
  content: LessonContent;
  writings: { kind: string; body: string }[];
  notes: string;
}) {
  const t = useTranslations("lesson.practice");
  const [showModel, setShowModel] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const speakingKind = content.speaking?.kind === "writing" ? "task2" : "speaking";
  const para = useAutoSaveText({ lessonId, kind: "paraphrase", prompt: content.paraphrase?.source ?? "", initial: writings.find((w) => w.kind === "paraphrase")?.body ?? "", placeholder: t("paraphrasePlaceholder"), rows: 3 });
  const sp = useAutoSaveText({
    lessonId,
    kind: speakingKind,
    prompt: content.speaking?.question ?? "",
    initial: writings.find((w) => w.kind === speakingKind)?.body ?? "",
    placeholder: speakingKind === "task2" ? t("writingPlaceholder") : t("speakingPlaceholder"),
    rows: speakingKind === "task2" ? 10 : 5,
  });
  const [lessonNotes, setLessonNotes] = useState(notes);
  const [savedNotes, setSavedNotes] = useState(notes);
  useEffect(() => {
    if (lessonNotes === savedNotes) return;
    const id = setTimeout(async () => {
      await fetch(`/api/lessons/${lessonId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes: lessonNotes }) });
      setSavedNotes(lessonNotes);
    }, 900);
    return () => clearTimeout(id);
  }, [lessonNotes, savedNotes, lessonId]);

  const wc = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

  return (
    <div className="space-y-8">
      {content.structures.length > 0 && (
        <section>
          <h3 className="mb-2 font-serif text-lg font-bold">{t("structures")}</h3>
          <div className="space-y-2.5">
            {content.structures.map((s, i) => (
              <div key={i} className="rounded-2xl border border-line bg-card p-4">
                <p className="font-serif text-[17px]">“{s.sentence}”</p>
                <p className="mt-2 text-sm text-muted">{s.explanation}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {content.paraphrase && (
        <section>
          <h3 className="font-serif text-lg font-bold">{t("paraphrase")}</h3>
          <p className="mb-2 text-sm text-muted">{t("paraphraseHint")}</p>
          <p className="mb-2 rounded-xl border-l-4 border-accent bg-card p-3 font-serif text-[17px]">“{content.paraphrase.source}”</p>
          {para.el}
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => setShowModel(!showModel)} className="min-h-10 rounded-xl border border-line px-3 text-sm">
              <I.IconEye className="inline-block h-4 w-4 align-[-0.2em]" /> {t("model")}
            </button>
          </div>
          {showModel && <p className="mt-2 rounded-xl bg-green-50 p-3 text-[15px] dark:bg-green-950/40">{content.paraphrase.model}</p>}
          <Feedback lessonId={lessonId} kind="paraphrase" prompt={content.paraphrase.source} answer={para.value} />
        </section>
      )}

      {content.speaking && (
        <section>
          <h3 className="font-serif text-lg font-bold">{speakingKind === "task2" ? t("writing") : t("speaking")}</h3>
          <p className="my-2 rounded-xl border border-line bg-card p-3 font-medium">{content.speaking.question}</p>
          {content.speaking.ideas.length > 0 && (
            <>
              <button onClick={() => setShowIdeas(!showIdeas)} className="mb-2 text-sm text-accent underline">
                <I.IconBulb className="inline-block h-4 w-4 align-[-0.2em]" /> {t("ideas")}
              </button>
              {showIdeas && (
                <ul className="mb-2 list-disc space-y-1 rounded-xl bg-card p-3 pl-7 text-[15px]">
                  {content.speaking.ideas.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {sp.el}
          <p className="mt-1 text-right text-xs text-muted">{t("words", { n: wc(sp.value) })}</p>
          <Feedback lessonId={lessonId} kind={speakingKind} prompt={content.speaking.question} answer={sp.value} />
        </section>
      )}

      <section>
        <h3 className="font-serif text-lg font-bold">{t("myNotes")}</h3>
        <textarea
          value={lessonNotes}
          onChange={(e) => setLessonNotes(e.target.value)}
          rows={5}
          placeholder={t("notesPlaceholder")}
          className="mt-2 w-full rounded-xl border border-line bg-card p-3 text-base leading-relaxed outline-none focus:border-accent"
        />
      </section>
    </div>
  );
}
