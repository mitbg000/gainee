"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DictResult } from "@/lib/dictionary/lookup";
import { speak } from "@/lib/speech";
import * as I from "@/components/icons";

/**
 * Offline dictionary viewer. Used on /dictionary and (Phase 1) in the reader side panel.
 * Cross-references inside entries (<a data-word>) open the linked word in place.
 */
export default function DictionaryLookup({ initialQuery = "", autoFocus = false }: { initialQuery?: string; autoFocus?: boolean }) {
  const t = useTranslations("dictionary");
  const [q, setQ] = useState(initialQuery);
  const [result, setResult] = useState<DictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);

  const search = useCallback(async (word: string, push = true) => {
    const w = word.trim();
    if (!w) return;
    setQ(w);
    setLoading(true);
    try {
      const r = await fetch(`/api/dictionary?q=${encodeURIComponent(w)}`);
      const data: DictResult = await r.json();
      setResult(data);
      if (push) setHistory((h) => [w, ...h.filter((x) => x !== w)].slice(0, 12));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery) search(initialQuery);
  }, [initialQuery, search]);

  function onClick(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest("a[data-word]");
    if (a) {
      e.preventDefault();
      search(a.getAttribute("data-word") || "");
      box.current?.scrollTo({ top: 0 });
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(q);
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("placeholder")}
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-accent"
        />
        <button className="rounded-xl bg-accent px-5 font-medium text-on-accent">{t("search")}</button>
      </form>

      {history.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {history.slice(1).map((h) => (
            <button key={h} onClick={() => search(h, false)} className="rounded-full border border-line bg-card px-3 py-1 text-sm text-muted hover:text-ink">
              {h}
            </button>
          ))}
        </div>
      )}

      <div ref={box} onClick={onClick} className="mt-5">
        {loading && <p className="text-muted">{t("loading")}</p>}
        {!loading && result && result.entries.length === 0 && (
          <div className="rounded-2xl border border-line bg-card p-5">
            <p>{t("notFound", { word: result.query })}</p>
            <p className="mt-1 text-sm text-muted">{t("askAiHint")}</p>
          </div>
        )}
        {!loading &&
          result?.entries.map((e) => (
            <article key={e.id} className="mb-3 rounded-2xl border border-line bg-card p-5">
              <header className="mb-2 flex items-center gap-3">
                <h2 className="font-serif text-2xl font-bold">{e.headword}</h2>
                <button onClick={() => speak(e.headword)} aria-label={t("listen")} className="rounded-lg border border-line px-2 py-1 text-sm">
                  <I.IconSpeaker className="inline-block h-4 w-4 align-[-0.2em]" />
                </button>
                {result.via !== "exact" && (
                  <span className="ml-auto text-xs text-muted">{t(`via.${result.via}`, { word: result.query })}</span>
                )}
              </header>
              <div className="dict-entry text-[15px]" dangerouslySetInnerHTML={{ __html: e.html }} />
            </article>
          ))}
      </div>
    </div>
  );
}
