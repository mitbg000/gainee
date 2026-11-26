"use client";

import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import { HL_COLORS, HL_DOT, type AiMsg, type Annotation, type HlColor } from "./types";
import * as I from "@/components/icons";

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
  const summary = a.kind === "summary";
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
      {summary && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">≡ {t("summary")}</p>}
      <div className="flex items-start gap-2">
        {!summary && <span className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${HL_DOT[a.color]}`} />}
        <p className="line-clamp-2 flex-1 font-serif italic text-muted">“{a.quote}”</p>
      </div>
      {(active || a.note) && (
        <textarea
          ref={ta}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== savedNote && (onPatch({ note: note.trim() ? note : null }), setSavedNote(note))}
          placeholder={t(summary ? "summaryPlaceholder" : "placeholder")}
          rows={1}
          className="mt-2 w-full resize-none rounded-lg border border-transparent bg-paper px-2 py-1.5 text-[15px] outline-none focus:border-accent"
        />
      )}
      {ai.map((m) => (
        <div key={m.id} className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2 dark:border-violet-900 dark:bg-violet-950/40">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span><I.IconSpark className="inline-block h-4 w-4 align-[-0.2em]" /> {t(`actions.${m.action}`)}</span>
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
          {!summary && HL_COLORS.map((c) => (
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
            className="btn btn-sm btn-danger ml-auto text-xs"
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
  tool,
}: {
  /** the open look-up / AI panel: placed level with its word, notes move out of its way */
  tool?: React.ReactNode;
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
  const toolBox = useRef<HTMLDivElement>(null);
  const [tops, setTops] = useState<Record<number, number>>({});
  const [toolTop, setToolTop] = useState(0);
  const visible = annotations.filter((a) => a.note || a.id === activeId || aiByAnn.get(a.id)?.length);

  useLayoutEffect(() => {
    const layout = () => {
      const c = col.current;
      if (!c) return;
      const base = c.getBoundingClientRect().top;
      const wanted = visible
        .map((a) => {
          const el = document.querySelector(`[data-ann="${a.id}"], [data-sum="${a.id}"]`);
          return { id: a.id, y: el ? el.getBoundingClientRect().top - base : 0 };
        })
        .sort((x, y) => x.y - y.y);
      // the look-up panel stays level with its word (or the top of the screen); cards it would cover go below it
      const word = document.querySelector("[data-tool]");
      const ty = tool ? Math.max(0, word ? word.getBoundingClientRect().top - base - 12 : 72 - base) : 0;
      const tb = tool ? ty + (toolBox.current?.offsetHeight ?? 300) : -Infinity;
      setToolTop((old) => (old === ty ? old : ty));
      const next: Record<number, number> = {};
      let bottom = -Infinity;
      for (const w of wanted) {
        const h = refs.current.get(w.id)?.offsetHeight ?? 80;
        let y = Math.max(w.y, bottom + 8);
        if (tool && y < tb + 8 && y + h > ty - 8) y = tb + 8;
        next[w.id] = y;
        bottom = y + h;
      }
      setTops((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    layout();
    const ro = new ResizeObserver(layout);
    if (col.current?.parentElement) ro.observe(col.current.parentElement);
    refs.current.forEach((el) => ro.observe(el));
    if (toolBox.current) ro.observe(toolBox.current);
    window.addEventListener("resize", layout);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", layout);
    };
  });

  return (
    <div ref={col} className="relative h-full" data-margin>
      {tool && (
        <div ref={toolBox} className="absolute inset-x-0 z-10 transition-[top] duration-200" style={{ top: toolTop }}>
          {tool}
        </div>
      )}
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
