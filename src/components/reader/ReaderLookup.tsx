"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DictResult } from "@/lib/dictionary/lookup";
import { speak } from "@/lib/speech";
import * as I from "@/components/icons";

/**
 * Kindle-style look-up for any reading text.
 *  - Tap / click a word            → offline dictionary entry for that word
 *  - Select a word or short phrase → entry for the selection (≤ 6 words)
 * Desktop: small card next to the word. Mobile: bottom sheet (like Kindle).
 * Uses only the offline dictionary – no AI call.
 */

type Hit = { text: string; rect: DOMRect; sentence: string };

const MAX_WORDS = 6;
const cache = new Map<string, DictResult>();

async function fetchEntry(q: string): Promise<DictResult> {
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const r = await fetch(`/api/dictionary?q=${encodeURIComponent(q)}`);
  const data: DictResult = await r.json();
  cache.set(key, data);
  return data;
}

/** Find the word under a point, using the browser caret APIs (Chrome/Safari and Firefox variants). */
function wordRangeAt(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) ({ offsetNode: node, offset } = p);
  }
  // fall back to the WebKit API when the standard one is missing or returned an element
  if ((!node || node.nodeType !== Node.TEXT_NODE) && document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) ({ startContainer: node, startOffset: offset } = r);
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent || "";
  const isWordChar = (c: string) => /[\p{L}\p{M}'’-]/u.test(c);
  let start = offset;
  let end = offset;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  while (end < text.length && isWordChar(text[end])) end++;
  // trim apostrophes/hyphens at the edges ("'word'" → "word")
  while (start < end && /['’-]/.test(text[start])) start++;
  while (end > start && /['’-]/.test(text[end - 1])) end--;
  if (end <= start) return null;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  // make sure the point is really on the word, not in the margin next to it
  const rect = range.getBoundingClientRect();
  if (x < rect.left - 4 || x > rect.right + 4 || y < rect.top - 4 || y > rect.bottom + 4) return null;
  return range;
}

function sentenceAround(range: Range): string {
  const block = (range.startContainer.parentElement?.closest("p, li, blockquote, h1, h2, h3") as HTMLElement) || null;
  if (!block) return "";
  const text = block.innerText;
  const word = range.toString();
  const i = text.indexOf(word);
  if (i < 0) return "";
  const before = text.slice(0, i).split(/(?<=[.!?])\s+/).pop() || "";
  const after = text.slice(i + word.length).split(/(?<=[.!?])\s+/)[0] || "";
  return (before + word + after).trim();
}

export default function ReaderLookup({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const t = useTranslations("reader");
  const root = useRef<HTMLDivElement>(null);
  const [hit, setHit] = useState<Hit | null>(null);
  const [result, setResult] = useState<DictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = matchMedia("(max-width: 767px), (pointer: coarse)");
    const set = () => setMobile(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  const current = useRef("");
  const open = useCallback(async (text: string, rect: DOMRect, sentence: string, force = false) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean || clean.split(" ").length > MAX_WORDS || clean.length > 80) return;
    if (!force && clean === current.current) return; // same word reported twice (click + selectionchange)
    current.current = clean;
    setHit({ text: clean, rect, sentence });
    setExpanded(false);
    setLoading(true);
    try {
      setResult(await fetchEntry(clean));
    } catch {
      setResult({ query: clean, matched: null, via: null, entries: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    current.current = "";
    setHit(null);
    setResult(null);
  }, []);

  // Selection (drag / double-click / long-press) → look up the selected text.
  useEffect(() => {
    function onSelectionEnd() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (!root.current?.contains(range.commonAncestorContainer)) return;
      const text = sel.toString();
      if (text.trim()) open(text, range.getBoundingClientRect(), sentenceAround(range));
    }
    const onUp = () => setTimeout(onSelectionEnd, 10);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    // iOS/Android long-press finishes the selection without a touchend on the text
    let timer: ReturnType<typeof setTimeout>;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(onSelectionEnd, 450);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
      document.removeEventListener("selectionchange", onChange);
      clearTimeout(timer);
    };
  }, [open]);

  // Tap / click on a single word.
  function onClick(e: React.MouseEvent) {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // handled by the selection listener
    if ((e.target as HTMLElement).closest("a, button, input, textarea")) return;
    const range = wordRangeAt(e.clientX, e.clientY);
    if (!range) return close();
    // show the tapped word as selected, like Kindle
    sel?.removeAllRanges();
    sel?.addRange(range);
    open(range.toString(), range.getBoundingClientRect(), sentenceAround(range));
  }

  useEffect(() => {
    if (!hit) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-lookup-card]") && !root.current?.contains(el)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [hit, close]);

  return (
    <>
      <div ref={root} onClick={onClick} className={`cursor-text ${className}`}>
        {children}
      </div>
      {hit && (
        <LookupCard
          hit={hit}
          result={result}
          loading={loading}
          expanded={expanded}
          setExpanded={setExpanded}
          mobile={mobile}
          onClose={close}
          onLookup={(w) => open(w, hit.rect, hit.sentence, true)}
          t={t}
        />
      )}
    </>
  );
}

function LookupCard({
  hit,
  result,
  loading,
  expanded,
  setExpanded,
  mobile,
  onClose,
  onLookup,
  t,
}: {
  hit: Hit;
  result: DictResult | null;
  loading: boolean;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  mobile: boolean;
  onClose: () => void;
  onLookup: (w: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const card = useRef<HTMLDivElement>(null);
  const entryBox = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = entryBox.current;
    setOverflows(!!el && el.scrollHeight > el.clientHeight + 2);
  }, [result, loading]);

  // Desktop: place the card below the word (or above if there is no room).
  useLayoutEffect(() => {
    if (mobile || !card.current) return;
    const w = card.current.offsetWidth;
    const h = card.current.offsetHeight;
    const r = hit.rect;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) top = r.top - h - 8;
    left += window.scrollX;
    top += window.scrollY;
    setPos({ top, left });
  }, [hit, result, expanded, mobile]);

  const entry = result?.entries[0];
  const more = (result?.entries.length || 0) > 1;

  function onEntryClick(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest("a[data-word]");
    if (a) {
      e.preventDefault();
      onLookup(a.getAttribute("data-word") || "");
    }
  }

  const body = (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-serif text-xl font-bold">{entry?.headword || hit.text}</span>
            {result?.via && result.via !== "exact" && (
              <span className="text-xs text-muted">{t("baseForm", { word: hit.text })}</span>
            )}
          </div>
        </div>
        <button onClick={() => speak(entry?.headword || hit.text)} aria-label={t("listen")} className="rounded-lg border border-line px-2 py-1 text-sm">
          <I.IconSpeaker className="inline-block h-4 w-4 align-[-0.2em]" />
        </button>
        <button onClick={onClose} aria-label={t("close")} className="rounded-lg px-2 py-1 text-muted hover:text-ink">
          <I.IconClose className="inline-block h-4 w-4 align-[-0.2em]" />
        </button>
      </div>

      <div className="mt-2" onClick={onEntryClick}>
        {loading && <p className="text-sm text-muted">{t("loading")}</p>}
        {!loading && !entry && <p className="text-sm text-muted">{t("notFound")}</p>}
        {!loading && entry && (
          <div className="relative">
            <div
              ref={entryBox}
              className={`dict-entry text-[15px] ${expanded ? "" : "max-h-40 overflow-hidden"}`}
              dangerouslySetInnerHTML={{ __html: (expanded ? result!.entries : [entry]).map((e) => e.html).join("<hr>") }}
            />
            {!expanded && overflows && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card" />}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {entry && (expanded || overflows || more) && (
          <button onClick={() => setExpanded(!expanded)} className="rounded-lg border border-line px-3 py-1.5">
            {expanded ? t("less") : more ? t("moreEntries", { n: result!.entries.length }) : t("more")}
          </button>
        )}
        <Link href={`/dictionary?q=${encodeURIComponent(hit.text)}`} className="rounded-lg border border-line px-3 py-1.5">
          {t("openDictionary")}
        </Link>
        <button disabled title={t("soon")} className="rounded-lg border border-line px-3 py-1.5 text-muted/60">
          <I.IconSpark className="inline-block h-4 w-4 align-[-0.2em]" /> {t("askAi")} <span className="text-[10px]">· {t("soon")}</span>
        </button>
        <button disabled title={t("soon")} className="rounded-lg border border-line px-3 py-1.5 text-muted/60">
          <I.IconStar className="inline-block h-4 w-4 align-[-0.2em]" /> {t("saveWord")}
        </button>
      </div>
    </>
  );

  if (mobile) {
    return (
      <div
        data-lookup-card
        role="dialog"
        aria-label={hit.text}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[60vh] overflow-y-auto rounded-t-3xl border-t border-line bg-card p-4 shadow-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        {body}
      </div>
    );
  }

  return (
    <div
      ref={card}
      data-lookup-card
      role="dialog"
      aria-label={hit.text}
      className="absolute z-50 w-[380px] max-w-[calc(100vw-16px)] rounded-2xl border border-line bg-card p-4 shadow-xl"
      style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}
    >
      {body}
    </div>
  );
}
