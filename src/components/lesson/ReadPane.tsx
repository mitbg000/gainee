"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RichPara } from "@/lib/text/rich";
import { findAll, offsetIn, segments, sentenceAt, type Mark } from "./marks";
import { MarginNotes, NoteCard } from "./Notes";
import type { TermWord } from "./Panes";
import ToolPanel from "./ToolPanel";
import { HL_COLORS, HL_DOT, type AiMsg, type Anchor, type Annotation, type HlColor, type Tool, type Vocab, type WordCard } from "./types";

type Props = {
  lessonId: number;
  /** Plain text of each paragraph: all offsets refer to it. */
  paragraphs: string[];
  /** Same length as `paragraphs`: formatting, headings and images. */
  blocks: RichPara[];
  wordCount: number;
  summary: string | null;
  warmup: string | null;
  vocab: Vocab[];
  annotations: Annotation[];
  aiMessages: AiMsg[];
  saved: Record<number, number>;
  savedTerms: Record<string, number>;
  termWords: TermWord[];
  onSaveCard: (card: WordCard, context: string) => Promise<void>;
  flash: { p: number; start: number; end: number } | null;
  onCreateAnnotation: (a: Omit<Annotation, "id" | "lessonId" | "createdAt" | "updatedAt" | "prefix" | "suffix">) => Promise<number | null>;
  onPatchAnnotation: (id: number, patch: { note?: string | null; color?: HlColor }) => void;
  onDeleteAnnotation: (id: number) => void;
  onPin: (messageId: number, answer: string, anchor?: Anchor, annotationId?: number, action?: AiMsg["action"]) => Promise<void>;
  onUnpin: (messageId: number) => void;
  onToggleSave: (vocabId: number) => void;
  onSaveTerm: (term: string, context: string, extra?: { ipa?: string | null; pos?: string | null; meaningVi?: string | null }) => void;
};

type Sel = Anchor & { rect: DOMRect };

function useIsDesktop() {
  const [d, setD] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(min-width: 1024px)");
    const f = () => setD(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return d;
}

/** Word under a tap/click (caret APIs differ between browsers). */
function wordAt(x: number, y: number): { node: Node; start: number; end: number } | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let node: Node | null = null;
  let off = 0;
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) ({ offsetNode: node, offset: off } = p);
  }
  // fall back to the WebKit API when the standard one is missing or returned an element
  if ((!node || node.nodeType !== Node.TEXT_NODE) && document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) ({ startContainer: node, startOffset: off } = r);
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent || "";
  const w = (c: string) => /[\p{L}\p{M}'’-]/u.test(c);
  let s = off;
  let e = off;
  while (s > 0 && w(text[s - 1])) s--;
  while (e < text.length && w(text[e])) e++;
  while (s < e && /['’-]/.test(text[s])) s++;
  while (e > s && /['’-]/.test(text[e - 1])) e--;
  if (e <= s) return null;
  const r = document.createRange();
  r.setStart(node, s);
  r.setEnd(node, e);
  const b = r.getBoundingClientRect();
  if (x < b.left - 3 || x > b.right + 3 || y < b.top - 3 || y > b.bottom + 3) return null;
  return { node, start: s, end: e };
}

export default function ReadPane(props: Props) {
  const t = useTranslations("lesson.read");
  const { paragraphs, vocab, annotations, aiMessages } = props;
  const desktop = useIsDesktop();
  const article = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [tool, setTool] = useState<Tool>(null);
  const [activeAnn, setActiveAnn] = useState<number | null>(null);
  const [focusAnn, setFocusAnn] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [fontSize, setFontSize] = useState(19);
  const [showSummary, setShowSummary] = useState(false);
  const [timer, setTimer] = useState({ start: Date.now(), lookups: 0, done: false, wpm: 0, seconds: 0 });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    try {
      const f = Number(localStorage.getItem("rl_font"));
      if (f >= 15 && f <= 26) setFontSize(f);
    } catch {}
  }, []);
  useEffect(() => {
    if (timer.done) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer.done]);

  const aiByAnn = useMemo(() => {
    const m = new Map<number, AiMsg[]>();
    for (const x of aiMessages) if (x.pinned && x.annotationId) m.set(x.annotationId, [...(m.get(x.annotationId) ?? []), x]);
    return m;
  }, [aiMessages]);

  /** Marks per paragraph: highlights + lesson vocabulary + "show in text" flash. */
  const marks = useMemo(() => {
    const out: Mark[][] = paragraphs.map(() => []);
    for (const v of vocab) {
      paragraphs.forEach((p, i) => {
        for (const [s, e] of findAll(p, v.match)) out[i].push({ start: s, end: e, kind: "vocab", id: v.id });
      });
    }
    // words the learner saved from look-ups get the same dotted underline as the AI's suggestions
    for (const term of Object.keys(props.savedTerms)) {
      paragraphs.forEach((p, i) => {
        for (const [s, e] of findAll(p, term)) out[i].push({ start: s, end: e, kind: "term", id: props.savedTerms[term] });
      });
    }
    props.blocks.forEach((b, i) => b.styles.forEach((st) => out[i]?.push({ start: st.start, end: st.end, kind: "fmt", id: 0, color: st.kind })));
    for (const a of annotations) if (out[a.paragraph]) out[a.paragraph].push({ start: a.startOffset, end: a.endOffset, kind: "ann", id: a.id, color: a.color });
    if (props.flash) out[props.flash.p]?.push({ start: props.flash.start, end: props.flash.end, kind: "flash", id: 0 });
    return out;
  }, [paragraphs, props.blocks, props.savedTerms, vocab, annotations, props.flash]);

  useEffect(() => {
    if (!props.flash) return;
    document.querySelector(`[data-flash]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [props.flash]);

  const annById = useMemo(() => new Map(annotations.map((a) => [a.id, a])), [annotations]);

  /* ---------- selection → toolbar ---------- */
  const readSelection = useCallback(() => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount || !article.current) return setSel(null);
    const r = s.getRangeAt(0);
    if (!article.current.contains(r.commonAncestorContainer)) return setSel(null);
    const pStart = (r.startContainer.nodeType === 1 ? (r.startContainer as Element) : r.startContainer.parentElement)?.closest("[data-p]");
    if (!pStart) return setSel(null);
    const pi = Number(pStart.getAttribute("data-p"));
    const text = paragraphs[pi];
    const start = offsetIn(pStart, r.startContainer, r.startOffset);
    const pEnd = (r.endContainer.nodeType === 1 ? (r.endContainer as Element) : r.endContainer.parentElement)?.closest("[data-p]");
    let end = pEnd === pStart ? offsetIn(pStart, r.endContainer, r.endOffset) : text.length; // clamp to one paragraph
    // trim whitespace
    let st = start;
    while (st < end && /\s/.test(text[st])) st++;
    while (end > st && /\s/.test(text[end - 1])) end--;
    if (end <= st) return setSel(null);
    setSel({ paragraph: pi, start: st, end, quote: text.slice(st, end), context: sentenceAt(text, st, end), rect: r.getBoundingClientRect() });
  }, [paragraphs]);

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    const onChange = () => {
      clearTimeout(timerId);
      timerId = setTimeout(readSelection, 250);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      clearTimeout(timerId);
    };
  }, [readSelection]);

  const clearSel = () => {
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };
  const countLookup = () => setTimer((x) => ({ ...x, lookups: x.lookups + 1 }));

  async function highlight(color: HlColor, withNote = false) {
    if (!sel) return;
    const id = await props.onCreateAnnotation({ paragraph: sel.paragraph, startOffset: sel.start, endOffset: sel.end, quote: sel.quote.slice(0, 1000), color, note: null });
    clearSel();
    if (id && withNote) {
      setActiveAnn(id);
      setFocusAnn(id);
      setTool(null);
    }
  }

  /* ---------- tap / click ---------- */
  function onArticleClick(e: React.MouseEvent) {
    const s = window.getSelection();
    if (s && !s.isCollapsed) return;
    const el = e.target as HTMLElement;
    const annEl = el.closest("[data-ann]");
    const vocabEl = el.closest("[data-vocab]");
    const w = wordAt(e.clientX, e.clientY);
    if (annEl && !vocabEl) {
      const id = Number(annEl.getAttribute("data-ann"));
      setActiveAnn(id);
      setTool(null);
      return;
    }
    if (!w) return;
    const pEl = (w.node.parentElement as Element).closest("[data-p]");
    if (!pEl) return;
    const pi = Number(pEl.getAttribute("data-p"));
    const start = offsetIn(pEl, w.node, w.start);
    const end = offsetIn(pEl, w.node, w.end);
    const text = paragraphs[pi].slice(start, end);
    countLookup();
    setActiveAnn(annEl ? Number(annEl.getAttribute("data-ann")) : null);
    setTool({
      mode: "lookup",
      text,
      vocabId: vocabEl ? Number(vocabEl.getAttribute("data-vocab")) : undefined,
      anchor: { paragraph: pi, start, end, quote: text, context: sentenceAt(paragraphs[pi], start, end) },
    });
  }

  function finishReading() {
    const seconds = Math.round((Date.now() - timer.start) / 1000);
    const wpm = Math.round(props.wordCount / Math.max(1, seconds / 60));
    setTimer((x) => ({ ...x, done: true, wpm, seconds }));
    setShowSummary(true);
    if (seconds >= 10) fetch(`/api/lessons/${props.lessonId}/reading`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seconds, words: props.wordCount, lookups: timer.lookups }) });
  }

  const setFont = (d: number) =>
    setFontSize((f) => {
      const n = Math.min(26, Math.max(15, f + d));
      try {
        localStorage.setItem("rl_font", String(n));
      } catch {}
      return n;
    });

  const elapsed = Math.round(((timer.done ? timer.start + timer.seconds * 1000 : now) - timer.start) / 1000);
  const noteCount = annotations.filter((a) => a.note || aiByAnn.get(a.id)?.length).length;
  const activeAnnotation = activeAnn ? annById.get(activeAnn) : undefined;

  const toolPanel = tool && (
    <ToolPanel
      tool={tool}
      lessonId={props.lessonId}
      vocab={vocab}
      saved={props.saved}
      savedTerms={props.savedTerms}
      termWords={props.termWords}
      onToggleSave={props.onToggleSave}
      onSaveTerm={props.onSaveTerm}
      onClose={() => setTool(null)}
      onAskAi={(next) => {
        countLookup();
        setTool(next);
      }}
      onPin={props.onPin}
      onSaveCard={props.onSaveCard}
    />
  );

  /* ---------- render ---------- */
  return (
    <div>
      {props.warmup && (
        <div className="mb-4 rounded-2xl border border-line bg-card p-4 text-sm">
          <b className="text-accent">{t("warmup")}</b> {props.warmup}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-lg bg-card px-2.5 py-1 font-mono tabular-nums text-muted" title={t("timer")}>
          ⏱ {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </span>
        <span className="text-muted">{t("hint")}</span>
        <span className="ml-auto flex gap-1">
          <button onClick={() => setFont(-1)} className="min-h-9 rounded-lg border border-line px-2.5" aria-label="A-">
            A−
          </button>
          <button onClick={() => setFont(1)} className="min-h-9 rounded-lg border border-line px-2.5" aria-label="A+">
            A+
          </button>
          {!desktop && (
            <button onClick={() => setNotesOpen(true)} className="min-h-9 rounded-lg border border-line px-2.5">
              ✎ {noteCount}
            </button>
          )}
        </span>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        {/* text */}
        <div ref={article} onClick={onArticleClick} className="font-serif leading-[1.8] text-ink" style={{ fontSize }}>
          {paragraphs.map((p, i) =>
            props.blocks[i].kind === "img" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={props.blocks[i].src} alt={props.blocks[i].alt ?? ""} loading="lazy" className="mx-auto my-4 max-h-[32rem] max-w-full rounded-xl" />
            ) : (
            <p key={i} data-p={i} className={props.blocks[i].kind === "h" ? "mb-[0.7em] mt-[1.4em] font-sans text-[1.15em] font-bold leading-snug" : "mb-[1.1em]"}>
              {segments(p, marks[i]).map((seg) => {
                if (!seg.marks.length) return seg.text;
                const ann = [...seg.marks].reverse().find((m) => m.kind === "ann");
                const voc = seg.marks.find((m) => m.kind === "vocab");
                const trm = seg.marks.some((m) => m.kind === "term");
                const flash = seg.marks.some((m) => m.kind === "flash");
                const a = ann ? annById.get(ann.id) : undefined;
                const noteEnd = a && (a.note || aiByAnn.get(a.id)?.length) && seg.end === a.endOffset;
                const bold = seg.marks.some((m) => m.kind === "fmt" && m.color === "b");
                const ital = seg.marks.some((m) => m.kind === "fmt" && m.color === "i");
                const cls = [ann ? `hl hl-${ann.color}` : "", ann && ann.id === activeAnn ? "active" : "", voc || trm ? "vw" : "", flash ? "flash" : "", bold ? "font-bold" : "", ital ? "italic" : ""].join(" ").trim();
                return (
                  <span
                    key={seg.start}
                    className={cls}
                    data-ann={ann?.id}
                    data-vocab={voc?.id}
                    data-flash={flash ? "" : undefined}
                    data-note-end={noteEnd ? "" : undefined}
                  >
                    {seg.text}
                  </span>
                );
              })}
            </p>
            ),
          )}

          <div className="mt-6 rounded-2xl border border-line bg-card p-4 font-sans text-base">
            {timer.done ? (
              <p>
                {t("result", { minutes: Math.floor(timer.seconds / 60), seconds: timer.seconds % 60, wpm: timer.wpm, lookups: timer.lookups })}{" "}
                <span className="text-muted">{timer.wpm < 150 ? t("wpmSlow") : timer.wpm < 250 ? t("wpmOk") : t("wpmFast")}</span>
              </p>
            ) : (
              <button onClick={finishReading} className="min-h-11 rounded-xl bg-accent px-5 font-medium text-on-accent">
                ✓ {t("finish")}
              </button>
            )}
            {props.summary && (
              <div className="mt-3">
                {showSummary ? (
                  <div className="rounded-xl border-l-4 border-accent2 bg-paper p-3 text-[15px] leading-relaxed">{props.summary}</div>
                ) : (
                  <button onClick={() => setShowSummary(true)} className="text-sm text-accent underline">
                    {t("showSummary")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* desktop right column: tool panel (sticky) above margin notes */}
        {desktop && (
          <aside className="relative">
            {tool && <div className="sticky top-4 z-10 mb-3 max-h-[calc(100dvh-2rem)] overflow-y-auto no-scrollbar">{toolPanel}</div>}
            <div className={tool ? "pointer-events-none absolute inset-0 opacity-30" : "absolute inset-0"}>
              <MarginNotes
                annotations={annotations}
                aiByAnn={aiByAnn}
                activeId={activeAnn}
                focusId={focusAnn}
                setActive={setActiveAnn}
                onPatch={props.onPatchAnnotation}
                onDelete={(id) => {
                  props.onDeleteAnnotation(id);
                  setActiveAnn(null);
                }}
                onUnpin={props.onUnpin}
                measureKey={`${fontSize}-${annotations.length}`}
              />
            </div>
            {annotations.length === 0 && !tool && <p className="text-sm text-muted">{t("marginHint")}</p>}
          </aside>
        )}
      </div>

      {/* selection toolbar */}
      {sel && (
        <div
          data-selbar
          onMouseDown={(e) => e.preventDefault()}
          className={
            desktop
              ? "absolute z-40 flex items-center gap-1 rounded-xl border border-line bg-card p-1 shadow-xl"
              : "fixed inset-x-2 z-40 flex items-center justify-between gap-1 rounded-2xl border border-line bg-card p-1.5 shadow-2xl"
          }
          style={
            desktop
              ? { top: sel.rect.top + window.scrollY - 52, left: Math.max(8, sel.rect.left + window.scrollX + sel.rect.width / 2 - 170) }
              : { bottom: "calc(env(safe-area-inset-bottom) + 4.25rem)" }
          }
        >
          {HL_COLORS.map((c) => (
            <button key={c} onClick={() => highlight(c)} aria-label={t("highlight")} className={`h-7 w-7 flex-none rounded-full ${HL_DOT[c]}`} />
          ))}
          <span className="mx-1 h-6 w-px bg-line" />
          <button onClick={() => highlight("yellow", true)} className="min-h-9 rounded-lg px-2 text-sm hover:bg-paper">
            ✎ <span className="hidden sm:inline">{t("note")}</span>
          </button>
          <button
            onClick={() => {
              countLookup();
              setTool({ mode: "lookup", text: sel.quote, anchor: sel });
              clearSel();
            }}
            className="min-h-9 rounded-lg px-2 text-sm hover:bg-paper"
          >
            📖 <span className="hidden sm:inline">{t("lookup")}</span>
          </button>
          <button
            onClick={() => {
              countLookup();
              const words = sel.quote.split(/\s+/).length;
              setTool({ mode: "ai", action: words <= 4 ? "explain_word" : "explain_sentence", selection: sel.quote, context: words <= 4 ? sel.context : paragraphs[sel.paragraph], anchor: sel });
              clearSel();
            }}
            className="min-h-9 rounded-lg px-2 text-sm font-medium text-accent hover:bg-paper"
          >
            ✨ <span className="hidden sm:inline">{t("ask")}</span>
          </button>
          {sel.quote.split(/\s+/).length <= 4 && (
            <button
              onClick={() => {
                props.onSaveTerm(sel.quote, sel.context);
                clearSel();
              }}
              className="min-h-9 rounded-lg px-2 text-sm hover:bg-paper"
            >
              ☆ <span className="hidden sm:inline">{t("save")}</span>
            </button>
          )}
        </div>
      )}

      {/* mobile sheets */}
      {!desktop && (tool || activeAnnotation || notesOpen) && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            aria-label={t("close")}
            className="absolute inset-0 bg-black/30"
            onClick={() => {
              setTool(null);
              setActiveAnn(null);
              setNotesOpen(false);
            }}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto no-scrollbar rounded-t-3xl bg-paper p-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" />
            {tool ? (
              toolPanel
            ) : activeAnnotation ? (
              <NoteCard
                a={activeAnnotation}
                ai={aiByAnn.get(activeAnnotation.id) ?? []}
                active
                autoFocus={focusAnn === activeAnnotation.id}
                onActivate={() => {}}
                onPatch={(p) => props.onPatchAnnotation(activeAnnotation.id, p)}
                onDelete={() => {
                  props.onDeleteAnnotation(activeAnnotation.id);
                  setActiveAnn(null);
                }}
                onUnpin={props.onUnpin}
              />
            ) : (
              <div className="space-y-2">
                <p className="px-1 font-medium">{t("allNotes", { n: noteCount })}</p>
                {annotations
                  .filter((a) => a.note || aiByAnn.get(a.id)?.length)
                  .map((a) => (
                    <NoteCard
                      key={a.id}
                      a={a}
                      ai={aiByAnn.get(a.id) ?? []}
                      active={false}
                      onActivate={() => {
                        setNotesOpen(false);
                        setActiveAnn(a.id);
                        document.querySelector(`[data-ann="${a.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      onPatch={(p) => props.onPatchAnnotation(a.id, p)}
                      onDelete={() => props.onDeleteAnnotation(a.id)}
                      onUnpin={props.onUnpin}
                    />
                  ))}
                {noteCount === 0 && <p className="px-1 text-sm text-muted">{t("marginHint")}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
