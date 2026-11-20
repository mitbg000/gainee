"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RichPara } from "@/lib/text/rich";
import { offsetIn, segments, type Mark } from "./marks";
import { HL_COLORS, HL_DOT, type Annotation, type HlColor } from "./types";
import * as I from "@/components/icons";

type Sel = { paragraph: number; start: number; end: number; quote: string; x: number; y: number };

/** The passage shown beside exercises/vocab: highlight while answering, adjustable font size. */
export default function SplitPassage({
  blocks,
  plain,
  annotations,
  flash,
  onHighlight,
  onDelete,
}: {
  blocks: RichPara[];
  plain: string[];
  annotations: Annotation[];
  flash: { p: number; start: number; end: number } | null;
  onHighlight: (a: { paragraph: number; start: number; end: number; quote: string; color: HlColor }) => void;
  onDelete: (id: number) => void;
}) {
  const t = useTranslations("lesson.read");
  const ref = useRef<HTMLElement>(null);
  const [font, setFont] = useState(18);
  const [sel, setSel] = useState<Sel | null>(null);
  const [hit, setHit] = useState<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    try {
      const f = Number(localStorage.getItem("rl_font"));
      if (f >= 15 && f <= 26) setFont(f);
    } catch {}
  }, []);
  const changeFont = (d: number) =>
    setFont((f) => {
      const n = Math.min(26, Math.max(13, f + d));
      try {
        localStorage.setItem("rl_font", String(n));
      } catch {}
      return n;
    });

  useEffect(() => {
    if (flash) ref.current?.querySelector("[data-flash]")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [flash]);

  const marks = useMemo(() => {
    const out: Mark[][] = blocks.map((b) => b.styles.map((s) => ({ start: s.start, end: s.end, kind: "fmt" as const, id: 0, color: s.kind })));
    for (const a of annotations) out[a.paragraph]?.push({ start: a.startOffset, end: a.endOffset, kind: "ann", id: a.id, color: a.color });
    if (flash) out[flash.p]?.push({ start: flash.start, end: flash.end, kind: "flash", id: 0 });
    return out;
  }, [blocks, annotations, flash]);

  function readSelection() {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount || !ref.current) return setSel(null);
    const r = s.getRangeAt(0);
    if (!ref.current.contains(r.commonAncestorContainer)) return setSel(null);
    const elOf = (n: Node) => (n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest("[data-p]");
    const pStart = elOf(r.startContainer);
    if (!pStart) return setSel(null);
    const pi = Number(pStart.getAttribute("data-p"));
    const text = plain[pi];
    let st = offsetIn(pStart, r.startContainer, r.startOffset);
    let end = elOf(r.endContainer) === pStart ? offsetIn(pStart, r.endContainer, r.endOffset) : text.length; // one paragraph at a time
    while (st < end && /\s/.test(text[st])) st++;
    while (end > st && /\s/.test(text[end - 1])) end--;
    if (end <= st) return setSel(null);
    const rect = r.getBoundingClientRect();
    setHit(null);
    setSel({ paragraph: pi, start: st, end, quote: text.slice(st, end), x: rect.left + rect.width / 2, y: rect.top });
  }

  function onClick(e: React.MouseEvent) {
    if (!window.getSelection()?.isCollapsed) return;
    const el = (e.target as HTMLElement).closest("[data-ann]");
    setSel(null);
    setHit(el ? { id: Number(el.getAttribute("data-ann")), x: e.clientX, y: e.clientY - 12 } : null);
  }

  // the passage scrolls on its own, so a floating bar would drift away from the text
  const close = () => {
    setSel(null);
    setHit(null);
  };

  const bar = "fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-xl border border-line bg-card p-1 font-sans shadow-xl";
  return (
    <>
      <div className="mb-2 flex items-center justify-end gap-1 font-sans text-sm">
        <button onClick={() => changeFont(-1)} className="btn btn-sm btn-secondary" aria-label="A-">
          A−
        </button>
        <button onClick={() => changeFont(1)} className="btn btn-sm btn-secondary" aria-label="A+">
          A+
        </button>
      </div>
      <article ref={ref} onMouseUp={readSelection} onClick={onClick} onScroll={close} className="max-h-[calc(100dvh-7.5rem)] overflow-y-auto rounded-2xl border border-line bg-card p-5 font-serif leading-[1.8] text-ink no-scrollbar" style={{ fontSize: font }}>
        {blocks.map((b, i) =>
          b.kind === "img" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={b.src} alt={b.alt ?? ""} loading="lazy" className="mx-auto my-4 max-h-96 max-w-full rounded-xl" />
          ) : (
            <p key={i} data-p={i} className={b.kind === "h" ? "mb-[0.7em] mt-[1.4em] font-sans text-[1.15em] font-bold" : "mb-[1.1em]"}>
              {segments(b.text, marks[i]).map((seg) => {
                if (!seg.marks.length) return seg.text;
                const ann = [...seg.marks].reverse().find((m) => m.kind === "ann");
                const flashed = seg.marks.some((m) => m.kind === "flash");
                const cls = [
                  ann ? `hl hl-${ann.color} cursor-pointer` : "",
                  flashed ? "flash" : "",
                  seg.marks.some((m) => m.color === "b") ? "font-bold" : "",
                  seg.marks.some((m) => m.color === "i") ? "italic" : "",
                ].join(" ");
                return (
                  <span key={seg.start} className={cls} data-ann={ann?.id} data-flash={flashed ? "" : undefined}>
                    {seg.text}
                  </span>
                );
              })}
            </p>
          ),
        )}
      </article>

      {sel && (
        <div className={bar} style={{ left: sel.x, top: sel.y - 6 }} onMouseDown={(e) => e.preventDefault()}>
          {HL_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                onHighlight({ paragraph: sel.paragraph, start: sel.start, end: sel.end, quote: sel.quote.slice(0, 1000), color: c });
                window.getSelection()?.removeAllRanges();
                setSel(null);
              }}
              aria-label={t("highlight")}
              className={`h-7 w-7 rounded-full ${HL_DOT[c]}`}
            />
          ))}
        </div>
      )}
      {hit && (
        <div className={bar} style={{ left: hit.x, top: hit.y }}>
          <button
            onClick={() => {
              if (annotations.find((a) => a.id === hit.id)?.note && !confirm(t("unhighlightConfirm"))) return;
              onDelete(hit.id);
              setHit(null);
            }}
            className="btn btn-sm btn-ghost"
          >
            <I.IconClose className="inline-block h-4 w-4 align-[-0.2em]" /> {t("unhighlight")}
          </button>
        </div>
      )}
    </>
  );
}
