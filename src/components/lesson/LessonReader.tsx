"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseRich } from "@/lib/text/rich";
import LessonEditor from "./LessonEditor";
import { locateQuote } from "./marks";
import { ExercisesPane, PracticePane, VocabPane, type TermWord } from "./Panes";
import ReadPane from "./ReadPane";
import SplitPassage from "./SplitPassage";
import type { AiMsg, Anchor, Annotation, HlColor, LessonData, WordCard } from "./types";
import * as I from "@/components/icons";

type Tab = "read" | "vocab" | "ex" | "practice";
const json = (body: unknown) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default function LessonReader({ data }: { data: LessonData }) {
  const t = useTranslations("lesson");
  const { lesson, document: doc, siblings, vocab } = data;
  const [tab, setTab] = useState<Tab>("read");
  const [annotations, setAnnotations] = useState<Annotation[]>(data.annotations);
  const [aiMessages, setAiMessages] = useState<AiMsg[]>(data.aiMessages);
  const [saved, setSaved] = useState<Record<number, number>>(data.savedVocab);
  const [termWords, setTermWords] = useState<TermWord[]>(data.savedTermWords);
  const savedTerms = useMemo(() => Object.fromEntries(termWords.map((w) => [w.term.toLowerCase(), w.id])) as Record<string, number>, [termWords]);
  const [flash, setFlash] = useState<{ p: number; start: number; end: number } | null>(null);
  const [completed, setCompleted] = useState(!!lesson.completedAt);
  const [best, setBest] = useState<number | null>(lesson.bestScore);
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState(false);
  const [split, setSplit] = useState(50); // % of the width given to the passage beside the exercises
  const splitBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("rl_split"));
      if (v >= 25 && v <= 75) setSplit(v);
    } catch {}
  }, []);
  function dragSplit(e: React.PointerEvent<HTMLDivElement>) {
    const box = splitBox.current?.getBoundingClientRect();
    if (!box || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const v = Math.round(Math.min(75, Math.max(25, ((e.clientX - box.left) / box.width) * 100)));
    setSplit(v);
    try {
      localStorage.setItem("rl_split", String(v));
    } catch {}
  }

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 1800);
  };
  const blocks = useMemo(() => lesson.paragraphs.map(parseRich), [lesson.paragraphs]);
  const plain = useMemo(() => blocks.map((b) => b.text), [blocks]);
  // remember where the reader is, so reopening the app (or an evicted tab) continues here
  useEffect(() => {
    document.cookie = `last_lesson=${lesson.id}; path=/; max-age=31536000; samesite=lax`;
    const key = `scroll_${lesson.id}`;
    try {
      const y = Number(localStorage.getItem(key));
      if (y > 0) setTimeout(() => window.scrollTo(0, y), 150);
    } catch {}
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        try {
          localStorage.setItem(key, String(Math.round(window.scrollY)));
        } catch {}
      }, 300);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(t);
    };
  }, [lesson.id]);
  const idx = siblings.findIndex((s) => s.id === lesson.id);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];

  /* ---------- annotations ---------- */
  const createAnnotation = useCallback(
    async (a: Omit<Annotation, "id" | "lessonId" | "createdAt" | "updatedAt" | "prefix" | "suffix">) => {
      const p = plain[a.paragraph];
      const body = { ...a, prefix: p.slice(Math.max(0, a.startOffset - 32), a.startOffset), suffix: p.slice(a.endOffset, a.endOffset + 32) };
      const r = await fetch(`/api/lessons/${lesson.id}/annotations`, { method: "POST", ...json(body) });
      if (!r.ok) return null;
      const { id } = await r.json();
      const now = new Date();
      setAnnotations((xs) => [...xs, { ...body, note: a.note ?? null, id, lessonId: lesson.id, createdAt: now, updatedAt: now }]);
      return id as number;
    },
    [lesson.id, plain],
  );
  const patchAnnotation = useCallback((id: number, patch: { note?: string | null; color?: HlColor }) => {
    setAnnotations((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    fetch(`/api/annotations/${id}`, { method: "PATCH", ...json(patch) });
  }, []);
  const deleteAnnotation = useCallback((id: number) => {
    setAnnotations((xs) => xs.filter((a) => a.id !== id));
    setAiMessages((xs) => xs.map((m) => (m.annotationId === id ? { ...m, annotationId: null, pinned: false } : m)));
    fetch(`/api/annotations/${id}`, { method: "DELETE" });
  }, []);

  /* ---------- AI pins ---------- */
  const pin = useCallback(
    async (messageId: number, answer: string, anchor?: Anchor, annotationId?: number, action: AiMsg["action"] = "explain_word") => {
      let annId = annotationId;
      if (!annId && anchor) annId = (await createAnnotation({ paragraph: anchor.paragraph, startOffset: anchor.start, endOffset: anchor.end, quote: anchor.quote.slice(0, 1000), color: "purple", note: null })) ?? undefined;
      await fetch(`/api/ai/messages/${messageId}`, { method: "PATCH", ...json({ pinned: true, annotationId: annId ?? null }) });
      setAiMessages((xs) => [
        { id: messageId, action, selection: anchor?.quote ?? null, question: null, answer, model: null, pinned: true, annotationId: annId ?? null, createdAt: new Date() },
        ...xs.filter((x) => x.id !== messageId),
      ]);
      say(t("pinned"));
    },
    [createAnnotation, t],
  );
  const unpin = useCallback((messageId: number) => {
    setAiMessages((xs) => xs.map((m) => (m.id === messageId ? { ...m, pinned: false } : m)));
    fetch(`/api/ai/messages/${messageId}`, { method: "PATCH", ...json({ pinned: false }) });
  }, []);

  /* ---------- vocabulary ---------- */
  const toggleSave = useCallback(
    async (vocabId: number) => {
      const wordId = saved[vocabId];
      if (wordId) {
        setSaved((s) => {
          const next = { ...s };
          delete next[vocabId];
          return next;
        });
        await fetch(`/api/words/${wordId}`, { method: "DELETE" });
        say(t("unsaved"));
      } else {
        const r = await fetch("/api/words", { method: "POST", ...json({ lessonVocabId: vocabId }) });
        if (r.ok) {
          const { id } = await r.json();
          setSaved((s) => ({ ...s, [vocabId]: id }));
          say(t("saved"));
        }
      }
    },
    [saved, t],
  );
  const saveAll = async () => {
    for (const v of vocab) if (!saved[v.id]) await toggleSave(v.id);
  };
  /** Save / un-save a word that is not in the lesson's vocabulary list (dictionary look-ups, selected words). */
  const toggleTerm = useCallback(
    async (term: string, context: string, extra?: { ipa?: string | null; pos?: string | null; meaningVi?: string | null }) => {
      const key = term.toLowerCase().slice(0, 191);
      const id = savedTerms[key];
      if (id) {
        setTermWords((ws) => ws.filter((w) => w.id !== id));
        await fetch(`/api/words/${id}`, { method: "DELETE" });
        return say(t("unsaved"));
      }
      const r = await fetch("/api/words", { method: "POST", ...json({ term: term.slice(0, 191), context, lessonId: lesson.id, ipa: extra?.ipa ?? undefined, pos: extra?.pos ?? undefined, meaningVi: extra?.meaningVi ?? undefined }) });
      if (!r.ok) return say(t("error"));
      const { id: newId } = await r.json();
      setTermWords((ws) => [{ id: newId, term: term.slice(0, 191), ipa: extra?.ipa ?? null, pos: extra?.pos ?? null, meaningVi: extra?.meaningVi ?? null, definitionEn: null, example: null, note: null, context }, ...ws]);
      say(t("saved"));
    },
    [savedTerms, lesson.id, t],
  );

  /** Save an AI-generated (and possibly edited) vocabulary card; updates the word if it is already saved. */
  const saveCard = useCallback(
    async (c: WordCard, context: string) => {
      const key = c.term.toLowerCase().slice(0, 191);
      const local: Omit<TermWord, "id"> = { term: c.term.slice(0, 191), ipa: c.ipa || null, pos: c.pos || null, meaningVi: c.meaningVi || null, definitionEn: c.definitionEn || null, example: c.example || null, note: c.note || null, context };
      const fields = { term: c.term.slice(0, 191), ipa: c.ipa, pos: c.pos.slice(0, 32), meaningVi: c.meaningVi, definitionEn: c.definitionEn, example: c.example, note: c.note, context };
      const id = savedTerms[key];
      if (id) {
        const r = await fetch(`/api/words/${id}`, { method: "PATCH", ...json(fields) });
        if (r.ok) setTermWords((ws) => ws.map((w) => (w.id === id ? { id, ...local } : w)));
        return say(r.ok ? t("saved") : t("error"));
      }
      const r = await fetch("/api/words", { method: "POST", ...json({ ...fields, lessonId: lesson.id }) });
      if (!r.ok) return say(t("error"));
      const { id: newId } = await r.json();
      setTermWords((ws) => [{ id: newId, ...local }, ...ws]);
      say(t("saved"));
    },
    [savedTerms, lesson.id, t],
  );

  async function toggleComplete() {
    const v = !completed;
    setCompleted(v);
    await fetch(`/api/lessons/${lesson.id}`, { method: "PATCH", ...json({ completed: v }) });
    if (v) say(t("completedToast"));
  }

  const locate = (quote: string) => {
    const hit = locateQuote(plain, quote);
    if (!hit) return say(t("notFoundInText"));
    if (!window.matchMedia("(min-width: 1024px)").matches) setTab("read"); // wide screens show the passage beside the exercises
    setFlash(null);
    setTimeout(() => setFlash(hit), 30);
    setTimeout(() => setFlash(null), 4000);
  };

  const content = lesson.content;
  const tabs: Tab[] = content ? ["read", "vocab", "ex", "practice"] : ["read"];

  return (
    <div>
      <div className="mx-auto max-w-6xl">
      <Link href={`/library/${doc.id}`} className="text-sm text-muted hover:text-ink">
        ← {doc.title}
      </Link>
      <p className="mt-3 text-xs font-bold uppercase tracking-widest text-accent2">
        {t("part", { n: lesson.position, total: siblings.length })} · {t("words", { n: lesson.wordCount })}
      </p>
      <h1 className="mt-1 font-serif text-3xl font-bold leading-tight md:text-4xl">{lesson.title}</h1>
      {lesson.titleVi && <p className="mt-1 text-muted">{lesson.titleVi}</p>}
      <button onClick={() => setEditing(true)} className="mt-2 text-sm text-accent underline">
        <I.IconEdit className="inline-block h-4 w-4 align-[-0.2em]" /> {t("edit.open")}
      </button>
      <Link href={`/assistant?lesson=${lesson.id}`} className="ml-4 mt-2 inline-block text-sm text-accent underline">
        <I.IconChat className="inline-block h-4 w-4 align-[-0.2em]" /> {t("askAssistant")}
      </Link>
      {editing && <LessonEditor lessonId={lesson.id} paragraphs={lesson.paragraphs} hasNext={!!next} onClose={() => setEditing(false)} />}
      </div>

      <div role="tablist" className="sticky top-[calc(env(safe-area-inset-top)+3rem)] z-20 -mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-line bg-paper/95 px-4 backdrop-blur md:top-0 md:mx-0 md:px-0">
        {tabs.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-medium ${tab === k ? "border-accent2 text-ink" : "border-transparent text-muted"}`}
          >
            {t(`tabs.${k}`)}
            {k === "vocab" && <span className="ml-1 text-xs text-muted">{vocab.length + termWords.length}</span>}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "read" && (
          <div className="mx-auto max-w-6xl">
          <ReadPane
            lessonId={lesson.id}
            paragraphs={plain}
            blocks={blocks}
            wordCount={lesson.wordCount}
            summary={lesson.summary}
            warmup={lesson.warmup}
            vocab={vocab}
            annotations={annotations}
            aiMessages={aiMessages}
            saved={saved}
            flash={flash}
            onCreateAnnotation={createAnnotation}
            onPatchAnnotation={patchAnnotation}
            onDeleteAnnotation={deleteAnnotation}
            onPin={pin}
            onUnpin={unpin}
            onToggleSave={toggleSave}
            onSaveTerm={toggleTerm}
            savedTerms={savedTerms}
            termWords={termWords}
            onSaveCard={saveCard}
          />
          </div>
        )}
        {tab !== "read" && (
          // Desktop: keep the passage visible beside the vocab/exercises/practice pane.
          <div ref={splitBox} className="lg:grid lg:grid-cols-[var(--split)_20px_minmax(0,1fr)] lg:items-start" style={{ "--split": `${split}%` } as React.CSSProperties}>
            <div className="sticky top-14 hidden lg:block">
              <SplitPassage
                blocks={blocks}
                plain={plain}
                annotations={annotations}
                flash={flash}
                onHighlight={(a) => createAnnotation({ paragraph: a.paragraph, startOffset: a.start, endOffset: a.end, quote: a.quote, color: a.color, note: null })}
                onDelete={deleteAnnotation}
              />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t("resizeSplit")}
              title={t("resizeSplit")}
              onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
              onPointerMove={dragSplit}
              onDoubleClick={() => setSplit(50)}
              className="sticky top-14 hidden h-[calc(100dvh-5rem)] cursor-col-resize touch-none select-none items-center justify-center lg:flex"
            >
              <span className="h-12 w-1 rounded-full bg-line" />
            </div>
            <div className="min-w-0">
              {tab === "vocab" && <VocabPane vocab={vocab} saved={saved} onToggleSave={toggleSave} onSaveAll={saveAll} termWords={termWords} onRemoveTerm={(w) => toggleTerm(w.term, w.context ?? "")} />}
              {tab === "ex" && content && <ExercisesPane lessonId={lesson.id} content={content} vocab={vocab} bestScore={best} lastAttempt={data.lastAttempt} onLocate={locate} onScored={setBest} />}
              {tab === "practice" && content && <PracticePane lessonId={lesson.id} content={content} writings={data.writings} notes={lesson.notes ?? ""} />}
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center gap-2 border-t border-line pt-5">
        {prev && (
          <Link href={`/lessons/${prev.id}`} className="flex min-h-11 items-center rounded-xl border border-line px-4 text-sm">
            ← {t("prev")}
          </Link>
        )}
        <button onClick={toggleComplete} className={`min-h-11 rounded-xl border px-4 text-sm ${completed ? "border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300" : "border-line"}`}>
          {completed ? `✓ ${t("completed")}` : t("markComplete")}
        </button>
        {next && (
          <Link
            href={`/lessons/${next.id}`}
            onClick={() => !completed && toggleComplete()}
            className="ml-auto flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-medium text-on-accent"
          >
            {t("next")} →
          </Link>
        )}
      </div>

      {toast && (
        <div className="fixed left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-ink px-4 py-2 text-sm text-paper shadow-lg" style={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
