"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { speak } from "@/lib/speech";
import { meaningOf, type PWord } from "./questions";
import * as I from "@/components/icons";

/**
 * Quizlet-style flashcards: flip the card, then sort it into "still learning" (←) or "know" (→).
 * At the end the "still learning" pile can be gone through again until it is empty.
 */
export default function Flashcards({ words, onExit }: { words: PWord[]; onExit: () => void }) {
  const t = useTranslations("practice.cards");
  const [deck, setDeck] = useState(words);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [meaningFirst, setMeaningFirst] = useState(false);
  const [learning, setLearning] = useState<PWord[]>([]);
  const [known, setKnown] = useState(0);
  const w = deck[i];

  const sort = useCallback(
    (know: boolean) => {
      if (!w) return;
      if (know) setKnown((n) => n + 1);
      else setLearning((l) => [...l, w]);
      setFlipped(false);
      setI((n) => n + 1);
    },
    [w],
  );
  const back = () => {
    if (!i) return;
    const prev = deck[i - 1];
    // undo the last sort
    setLearning((l) => (l[l.length - 1]?.id === prev.id ? l.slice(0, -1) : l));
    if (learning[learning.length - 1]?.id !== prev.id) setKnown((n) => Math.max(0, n - 1));
    setFlipped(false);
    setI(i - 1);
  };
  const restart = (list: PWord[]) => {
    setDeck(list);
    setI(0);
    setFlipped(false);
    setLearning([]);
    setKnown(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!w || (e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") sort(true);
      else if (e.key === "ArrowLeft") sort(false);
      else if (e.key.toLowerCase() === "r") speak(w.term);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [w, sort]);

  if (!w)
    return (
      <div className="rounded-3xl border border-line bg-card p-8 text-center">
        <p className="font-serif text-2xl font-bold">{learning.length ? t("roundDone") : t("allKnown")}</p>
        <div className="mx-auto mt-4 flex max-w-sm justify-center gap-6 text-sm">
          <span className="font-semibold text-green-700 dark:text-green-400">
            {known} {t("know")}
          </span>
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            {learning.length} {t("learning")}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {learning.length > 0 && (
            <button onClick={() => restart(learning)} className="btn btn-primary">
              {t("goLearning", { n: learning.length })}
            </button>
          )}
          <button onClick={() => restart(words)} className="btn btn-secondary">
            {t("restart")}
          </button>
          <button onClick={onExit} className="btn btn-secondary">
            {t("exit")}
          </button>
        </div>
      </div>
    );

  const termSide = (
    <>
      <span className="font-serif text-4xl font-bold">{w.term}</span>
      <span className="mt-2 text-muted">
        {w.pos && <span className="font-semibold text-accent2">{w.pos} </span>}
        {w.ipa}
      </span>
    </>
  );
  const meaningSide = (
    <>
      {w.images?.[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={w.images[0].url} alt="" className="mb-3 max-h-36 max-w-[60%] rounded-lg object-contain" />
      )}
      <span className="text-2xl font-semibold text-accent">{meaningOf(w) || "—"}</span>
      {w.meaningVi && w.definitionEn && <span className="mt-2 max-w-md text-muted">{w.definitionEn}</span>}
      {(w.example || w.context) && <span className="mt-4 max-w-lg font-serif text-[15px] italic text-muted">“{w.example || w.context}”</span>}
      {w.mnemonic && (
        <span className="mt-3 text-sm">
          <I.IconBulb className="inline-block h-4 w-4 align-[-0.2em]" /> {w.mnemonic}
        </span>
      )}
    </>
  );
  const face = "absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-line bg-card p-6 text-center shadow-sm [backface-visibility:hidden]";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="min-w-10 rounded-full border border-amber-400 px-2 text-center font-semibold tabular-nums text-amber-700 dark:text-amber-400">{learning.length}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/70">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(i / deck.length) * 100}%` }} />
        </div>
        <span className="tabular-nums text-muted">
          {i + 1}/{deck.length}
        </span>
        <span className="min-w-10 rounded-full border border-green-500 px-2 text-center font-semibold tabular-nums text-green-700 dark:text-green-400">{known}</span>
      </div>

      <button
        onClick={() => setFlipped(!flipped)}
        className="relative block h-80 w-full [perspective:1200px] md:h-96"
        aria-label={t("flip")}
      >
        <span className={`absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d] ${flipped ? "[transform:rotateY(180deg)]" : ""}`}>
          <span className={face}>{meaningFirst ? meaningSide : termSide}</span>
          <span className={`${face} [transform:rotateY(180deg)]`}>{meaningFirst ? termSide : meaningSide}</span>
        </span>
      </button>

      <div className="mt-4 flex items-center justify-center gap-3">
        <button onClick={() => sort(false)} className="flex min-h-12 items-center gap-2 rounded-full border-2 border-amber-400 bg-card px-5 font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40">
          ← {t("learning")}
        </button>
        <button onClick={() => speak(w.term)} className="icon-btn icon-btn-outline" aria-label={t("listen")}>
          <I.IconSpeaker />
        </button>
        <button onClick={() => sort(true)} className="flex min-h-12 items-center gap-2 rounded-full border-2 border-green-500 bg-card px-5 font-semibold text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-950/40">
          {t("know")} →
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
        <button onClick={back} disabled={!i} className="btn btn-sm btn-ghost">
          <I.IconUndo className="inline-block h-4 w-4 align-[-0.2em]" /> {t("undo")}
        </button>
        <label className="flex items-center gap-2 text-muted">
          <input type="checkbox" checked={meaningFirst} onChange={(e) => setMeaningFirst(e.target.checked)} />
          {t("meaningFirst")}
        </label>
        <button onClick={onExit} className="btn btn-sm btn-ghost">
          {t("exit")}
        </button>
      </div>
      <p className="mt-2 hidden text-center text-xs text-muted md:block">{t("keys")}</p>
    </div>
  );
}
