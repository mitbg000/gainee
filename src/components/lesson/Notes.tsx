"use client";

import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import { HL_COLORS, HL_DOT, type AiMsg, type Annotation, type HlColor } from "./types";

type CardProps = {
  a: Annotation;
  ai: AiMsg[];
  active: boolean;
  autoFocus?: boolean;
  onActivate: () => void;
  onPatch: (patch: { note?: string | null; color?: HlColor }) => void;
  onDelete: () => void;
  onUnpin: (msgId: number) => void;
};

/** One margin note: quote, colour, editable note and pinned AI answers. */
export function NoteCard({ a, ai, active, autoFocus, onActivate, onPatch, onDelete, onUnpin }: CardProps) {
  const t = useTranslations("lesson.notes");
  const [note, setNote] = useState(a.note ?? "");
  const [savedNote, setSavedNote] = useState(a.note ?? "");
  const ta = useRef<HTMLTextAreaElement>(null);
  const patchRef = useRef(onPatch);
  useEffect(() => {
    patchRef.current = onPatch;
  });

  // auto-save while typing (debounced)
  useEffect(() => {
    if (note === savedNote) return;
    const id = setTimeout(() => {
      patchRef.current({ note: note.trim() ? note : null });
      setSavedNote(note);
    }, 700);
    return () => clearTimeout(id);
  }, [note, savedNote]);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(240, el.scrollHeight)}px`;
  }, [note, active]);

  useEffect(() => {
    if (autoFocus) ta.current?.focus();
  }, [autoFocus]);

  return (
    <div
      onClick={onActivate}
      className={`rounded-xl border bg-card p-3 text-sm shadow-sm transition ${active ? "border-accent ring-2 ring-accent/20" : "border-line"}`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${HL_DOT[a.color]}`} />
        <p className="line-clamp-2 flex-1 font-serif italic text-muted">“{a.quote}”</p>
      </div>
      {(active || a.note) && (
        <textarea
          ref={ta}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== savedNote && (onPatch({ note: note.trim() ? note : null }), setSavedNote(note))}
          placeholder={t("placeholder")}
          rows={1}
          className="mt-2 w-full resize-none rounded-lg border border-transparent bg-paper px-2 py-1.5 text-[15px] outline-none focus:border-accent"
        />
      )}
      {ai.map((m) => (
        <div key={m.id} className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2 dark:border-violet-900 dark:bg-violet-950/40">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>✨ {t(`actions.${m.action}`)}</span>
            {active && (
              <button onClick={() => onUnpin(m.id)} className="hover:text-ink">
                {t("unpin")}
              </button>
            )}
          </div>
          <Markdown text={m.answer ?? ""} className="text-[14px] leading-relaxed" />
        </div>
      ))}
      {active && (
        <div className="mt-2 flex items-center gap-1.5">
          {HL_COLORS.map((c) => (
            <button
              key={c}
              aria-label={c}
              onClick={(e) => {
                e.stopPropagation();
                onPatch({ color: c });
              }}
              className={`h-5 w-5 rounded-full ${HL_DOT[c]} ${a.color === c ? "ring-2 ring-ink ring-offset-1 ring-offset-card" : ""}`}
            />
          ))}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="ml-auto rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            {t("delete")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Desktop margin: cards are placed next to their highlight (Google-Docs style)
 * and pushed down when they would overlap.
 */
export function MarginNotes({
  annotations,
  aiByAnn,
  activeId,
  focusId,
  setActive,
  onPatch,
  onDelete,
  onUnpin,
  measureKey,
}: {
  annotations: Annotation[];
  aiByAnn: Map<number, AiMsg[]>;
  activeId: number | null;
  focusId: number | null;
  setActive: (id: number | null) => void;
  onPatch: (id: number, patch: { note?: string | null; color?: HlColor }) => void;
  onDelete: (id: number) => void;
  onUnpin: (msgId: number) => void;
  measureKey: string;
}) {
  const col = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<number, HTMLDivElement>());
  const [tops, setTops] = useState<Record<number, number>>({});
  const visible = annotations.filter((a) => a.note || a.id === activeId || aiByAnn.get(a.id)?.length);

  useLayoutEffect(() => {
    const layout = () => {
      const c = col.current;
      if (!c) return;
      const base = c.getBoundingClientRect().top;
      const wanted = visible
        .map((a) => {
          const el = document.querySelector(`[data-ann="${a.id}"]`);
          return { id: a.id, y: el ? el.getBoundingClientRect().top - base : 0 };
        })
        .sort((x, y) => x.y - y.y);
      // keep the active card exactly at its highlight; push others around it
      const next: Record<number, number> = {};
      let bottom = -Infinity;
      for (const w of wanted) {
        const h = refs.current.get(w.id)?.offsetHeight ?? 80;
        const y = Math.max(w.y, bottom + 8);
        next[w.id] = y;
        bottom = y + h;
      }
      setTops((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    layout();
    const ro = new ResizeObserver(layout);
    if (col.current?.parentElement) ro.observe(col.current.parentElement);
    refs.current.forEach((el) => ro.observe(el));
    window.addEventListener("resize", layout);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", layout);
    };
  });

  return (
    <div ref={col} className="relative h-full" data-margin>
      {visible.map((a) => (
        <div
          key={a.id}
          ref={(el) => {
            if (el) refs.current.set(a.id, el);
            else refs.current.delete(a.id);
          }}
          className="absolute inset-x-0 transition-[top] duration-200"
          style={{ top: tops[a.id] ?? 0, zIndex: a.id === activeId ? 2 : 1 }}
          data-measure={measureKey}
        >
          <NoteCard
            a={a}
            ai={aiByAnn.get(a.id) ?? []}
            active={a.id === activeId}
            autoFocus={a.id === focusId}
            onActivate={() => setActive(a.id)}
            onPatch={(p) => onPatch(a.id, p)}
            onDelete={() => onDelete(a.id)}
            onUnpin={onUnpin}
          />
        </div>
      ))}
    </div>
  );
}
