"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { meaningOf } from "@/components/practice/questions";
import { autoSpeak, speak } from "@/lib/speech";
import * as I from "@/components/icons";
import { sfx } from "@/lib/sound";

type Card = { id: number; term: string; ipa: string | null; meaningVi: string | null; definitionEn: string | null; example: string | null; images?: { url: string }[] };

/** Flashcard viewer on the set page: click to flip, arrows to move, as on a Quizlet set. */
export default function CardViewer({ cards }: { cards: Card[] }) {
  const t = useTranslations("notebook");
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const c = cards[Math.min(i, cards.length - 1)];
  const go = (d: number) => {
    autoSpeak(cards[(i + d + cards.length) % cards.length].term);
    setFlip(false);
    setI((n) => (n + d + cards.length) % cards.length);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,button")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") {
        e.preventDefault();
        sfx("flip");
        setFlip((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!c) return null;
  const face = "absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-line bg-card p-6 text-center shadow-sm [backface-visibility:hidden]";
  return (
    <div className="mt-5">
      <button
        onClick={() => {
          sfx("flip");
          setFlip(!flip);
        }}
        className="relative block h-72 w-full [perspective:1200px] md:h-80" aria-label={t("flip")}>
        <span className={`absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d] ${flip ? "[transform:rotateY(180deg)]" : ""}`}>
          <span className={face}>
            <span className="font-serif text-4xl font-bold">{c.term}</span>
            {c.ipa && <span className="mt-2 text-muted">{c.ipa}</span>}
          </span>
          <span className={`${face} [transform:rotateY(180deg)]`}>
            {c.images?.[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.images[0].url} alt="" className="mb-3 max-h-36 max-w-[60%] rounded-lg object-contain" />
            )}
            <span className="text-2xl font-semibold">{meaningOf(c) || "—"}</span>
            {c.example && <span className="mt-3 max-w-lg font-serif italic text-muted">“{c.example}”</span>}
          </span>
        </span>
      </button>
      <div className="mt-3 flex items-center justify-center gap-4">
        <button onClick={() => go(-1)} className="icon-btn icon-btn-outline rounded-full" aria-label={t("prev")}>
          <I.IconArrowLeft />
        </button>
        <span className="min-w-16 text-center text-sm font-semibold tabular-nums">
          {i + 1} / {cards.length}
        </span>
        <button onClick={() => go(1)} className="icon-btn icon-btn-outline rounded-full" aria-label={t("next")}>
          <I.IconArrowRight />
        </button>
        <button onClick={() => speak(c.term)} className="icon-btn" aria-label={t("listen")}>
          <I.IconSpeaker />
        </button>
      </div>
    </div>
  );
}
