"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseRich } from "@/lib/text/rich";
import RichBlock from "./RichBlock";
import LessonEditor from "./LessonEditor";
import { locateQuote } from "./marks";
import { ExercisesPane, PracticePane, VocabPane } from "./Panes";
import ReadPane from "./ReadPane";
import type { AiMsg, Anchor, Annotation, HlColor, LessonData } from "./types";

type Tab = "read" | "vocab" | "ex" | "practice";
const json = (body: unknown) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default function LessonReader({ data }: { data: LessonData }) {
  const t = useTranslations("lesson");
  const { lesson, document: doc, siblings, vocab } = data;
  const [tab, setTab] = useState<Tab>("read");
  const [annotations, setAnnotations] = useState<Annotation[]>(data.annotations);
  const [aiMessages, setAiMessages] = useState<AiMsg[]>(data.aiMessages);
  const [saved, setSaved] = useState<Record<number, number>>(data.savedVocab);
  const [savedTerms, setSavedTerms] = useState<Record<string, number>>(data.savedTerms);
  const [flash, setFlash] = useState<{ p: number; start: number; end: number } | null>(null);
  const [completed, setCompleted] = useState(!!lesson.completedAt);
  const [best, setBest] = useState<number | null>(lesson.bestScore);
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState(false);

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
    async (term: string, context: string) => {
      const key = term.toLowerCase().slice(0, 191);
      const id = savedTerms[key];
      if (id) {
        setSavedTerms((s) => {
          const next = { ...s };
          delete next[key];
          return next;
        });
        await fetch(`/api/words/${id}`, { method: "DELETE" });
        return say(t("unsaved"));
      }
      const r = await fetch("/api/words", { method: "POST", ...json({ term: term.slice(0, 191), context, lessonId: lesson.id }) });
      if (!r.ok) return say(t("error"));
      const { id: newId } = await r.json();
      setSavedTerms((s) => ({ ...s, [key]: newId }));
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
    setTab("read");
    setFlash(null);
    setTimeout(() => setFlash(hit), 30);
    setTimeout(() => setFlash(null), 4000);
  };

  const content = lesson.content;
  const tabs: Tab[] = content ? ["read", "vocab", "ex", "practice"] : ["read"];

  return (
    <div>
      <Link href={`/library/${doc.id}`} className="text-sm text-muted hover:text-ink">
        ← {doc.title}
      </Link>
      <p className="mt-3 text-xs font-bold uppercase tracking-widest text-accent2">
        {t("part", { n: lesson.position, total: siblings.length })} · {t("words", { n: lesson.wordCount })}
      </p>
      <h1 className="mt-1 font-serif text-3xl font-bold leading-tight md:text-4xl">{lesson.title}</h1>
      {lesson.titleVi && <p className="mt-1 text-muted">{lesson.titleVi}</p>}
      <button onClick={() => setEditing(true)} className="mt-2 text-sm text-accent underline">
        ✎ {t("edit.open")}
      </button>
      {editing && <LessonEditor lessonId={lesson.id} paragraphs={lesson.paragraphs} hasNext={!!next} onClose={() => setEditing(false)} />}

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
            {k === "vocab" && <span className="ml-1 text-xs text-muted">{vocab.length}</span>}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "read" && (
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
          />
        )}
        {tab !== "read" && (
          // Desktop: keep the passage visible beside the vocab/exercises/practice pane.
          <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
            <article className="sticky top-14 hidden max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-line bg-card p-5 font-serif leading-[1.8] text-ink lg:block">
              {blocks.map((b, i) => (
                <RichBlock key={i} block={b} />
              ))}
            </article>
            <div className="min-w-0">
              {tab === "vocab" && <VocabPane vocab={vocab} saved={saved} onToggleSave={toggleSave} onSaveAll={saveAll} />}
              {tab === "ex" && content && <ExercisesPane lessonId={lesson.id} content={content} vocab={vocab} bestScore={best} onLocate={locate} onScored={setBest} />}
              {tab === "practice" && content && <PracticePane lessonId={lesson.id} content={content} writings={data.writings} notes={lesson.notes ?? ""} />}
            </div>
          </div>
        )}
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-line pt-5">
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
