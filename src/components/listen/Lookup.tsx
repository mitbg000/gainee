"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import ToolPanel from "@/components/lesson/ToolPanel";
import type { Tool, WordCard } from "@/components/lesson/types";

const json = (body: unknown) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Look-up, AI questions and saved words while practising listening; words are saved with their recording. */
export function useLookup(saved: { id: number; term: string }[]) {
  const [tool, setTool] = useState<Tool>(null);
  const [terms, setTerms] = useState<Record<string, number>>(() => Object.fromEntries(saved.map((w) => [w.term.toLowerCase(), w.id])));

  async function toggle(sourceId: number, term: string, context: string, extra?: { ipa?: string | null; pos?: string | null; meaningVi?: string | null; example?: string | null }) {
    const key = term.toLowerCase().slice(0, 191);
    const id = terms[key];
    if (id) {
      setTerms((t) => Object.fromEntries(Object.entries(t).filter(([k]) => k !== key)));
      await fetch(`/api/words/${id}`, { method: "DELETE" });
      return;
    }
    const r = await fetch("/api/words", { method: "POST", ...json({ term: term.slice(0, 191), context, listenSourceId: sourceId, ipa: extra?.ipa ?? undefined, pos: extra?.pos?.slice(0, 32) ?? undefined, meaningVi: extra?.meaningVi ?? undefined, example: extra?.example ?? undefined }) });
    if (r.ok) {
      const { id: newId } = await r.json();
      setTerms((t) => ({ ...t, [key]: newId }));
    }
  }

  async function saveCard(sourceId: number, c: WordCard, context: string) {
    const key = c.term.toLowerCase().slice(0, 191);
    const fields = { term: c.term.slice(0, 191), ipa: c.ipa, pos: c.pos.slice(0, 32), meaningVi: c.meaningVi, definitionEn: c.definitionEn, example: c.example, note: c.note, context };
    if (terms[key]) return void (await fetch(`/api/words/${terms[key]}`, { method: "PATCH", ...json(fields) }));
    const r = await fetch("/api/words", { method: "POST", ...json({ ...fields, listenSourceId: sourceId }) });
    if (r.ok) {
      const { id } = await r.json();
      setTerms((t) => ({ ...t, [key]: id }));
    }
  }

  /** The panel for the open look-up: the right column on wide screens (see ListenLayout), a bottom sheet below that. */
  const panel = (sourceId: number) =>
    tool && (
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto p-2 xl:static xl:z-auto xl:max-h-none xl:overflow-visible xl:p-0" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <ToolPanel
          tool={tool}
          vocab={[]}
          saved={{}}
          savedTerms={terms}
          termWords={[]}
          onToggleSave={() => {}}
          onSaveTerm={(term, context, extra) => toggle(sourceId, term, context, extra)}
          onClose={() => setTool(null)}
          onAskAi={setTool}
          onSaveCard={(c, context) => saveCard(sourceId, c, context)}
        />
      </div>
    );

  return { tool, setTool, panel, savedCount: Object.keys(terms).length };
}

/**
 * A sentence whose words can be looked up: tap a word, or select a few words. Only shown once the learner has
 * written the sentence (or asked for it), so it never gives the answer away.
 */
export function LookupText({ text, onLookup, className = "" }: { text: string; onLookup: (t: Extract<Tool, { mode: "lookup" }>) => void; className?: string }) {
  const open = (w: string) => {
    const clean = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (clean) onLookup({ mode: "lookup", text: clean, anchor: { paragraph: 0, start: 0, end: 0, quote: clean, context: text } });
  };
  return (
    <p
      className={className}
      onMouseUp={() => {
        const s = window.getSelection()?.toString().trim() ?? "";
        if (s && s.split(/\s+/).length <= 6) open(s);
      }}
    >
      {text.split(/(\s+)/).map((p, i) =>
        /\s/.test(p) || !p ? (
          p
        ) : (
          <span
            key={i}
            onClick={() => !window.getSelection()?.toString().trim() && open(p)}
            className="cursor-pointer rounded hover:bg-accent/10"
          >
            {p}
          </span>
        ),
      )}
    </p>
  );
}

/** A column's width in px, dragged by its edge and kept in this browser (double click: back to the default). */
function useWidth(key: string, initial: number, min: number, max: number) {
  const [w, setW] = useState(initial);
  const drag = useRef<{ x0: number; w0: number; last: number } | null>(null);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(key));
      if (v >= min && v <= max) setW(v);
    } catch {}
  }, [key, min, max]);
  const handle = (dir: 1 | -1, className: string, label: string) => (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      onDoubleClick={() => {
        setW(initial);
        try {
          localStorage.removeItem(key);
        } catch {}
      }}
      // the pointer is captured: moves and the release still come here over the YouTube frame
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x0: e.clientX, w0: w, last: w };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) setW((d.last = Math.min(max, Math.max(min, d.w0 + dir * (e.clientX - d.x0)))));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d)
          try {
            localStorage.setItem(key, String(Math.round(d.last)));
          } catch {}
      }}
      onPointerCancel={() => (drag.current = null)}
      className={`group absolute inset-y-0 z-10 w-3 cursor-col-resize touch-none select-none ${className}`}
    >
      <span className="mx-auto block h-full w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-accent/50 group-active:bg-accent" />
    </div>
  );
  return [w, handle] as const;
}

/**
 * The listening screens' layout, like the reader's: the work in the middle, look-up on the right (xl). A video gets its
 * own column on the left (lg and up); an audio recording is a card at the top of the work. Below xl the look-up opens
 * as a bottom sheet; on phones everything is one column. The video and look-up columns can be dragged wider/narrower.
 */
export function ListenLayout({ media, video, children, side }: { media: React.ReactNode; video: boolean; children: React.ReactNode; side: React.ReactNode }) {
  const t = useTranslations("listen");
  const [mediaW, mediaHandle] = useWidth("rl_listen_media_w", 520, 280, 960);
  const [sideW, sideHandle] = useWidth("rl_listen_side_w", 320, 260, 560);
  const cols = video ? "lg:grid-cols-[minmax(0,var(--mw))_minmax(20rem,1fr)] xl:grid-cols-[minmax(0,var(--mw))_minmax(20rem,1fr)_var(--sw)]" : "xl:grid-cols-[minmax(0,1fr)_var(--sw)]";
  return (
    <div className={`grid gap-4 md:gap-5 lg:items-start ${cols}`} style={{ "--mw": `${mediaW}px`, "--sw": `${sideW}px` } as React.CSSProperties}>
      {video && (
        <div className="relative min-w-0 space-y-3 lg:sticky lg:top-20">
          {media}
          <div className="hidden lg:block">{mediaHandle(1, "-right-4", t("resize"))}</div>
        </div>
      )}
      <div className={`min-w-0 space-y-4 ${video ? "" : "mx-auto w-full max-w-3xl"}`}>
        {!video && media}
        {children}
      </div>
      <aside className="relative min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)]">
        <div className="hidden xl:block">{sideHandle(-1, "-left-4", t("resize"))}</div>
        <div className="xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
          {side}
        </div>
      </aside>
    </div>
  );
}
