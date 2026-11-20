"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { speak } from "@/lib/speech";
import * as I from "@/components/icons";

type Card = {
  id: number;
  term: string;
  ipa: string | null;
  pos: string | null;
  meaningVi: string | null;
  definitionEn: string | null;
  example: string | null;
  note: string | null;
  context: string | null;
  state: number;
  images: string[];
};
type Mode = "recognize" | "recall" | "cloze" | "listen";
const MODES: Mode[] = ["recognize", "recall", "cloze", "listen"];
const RATINGS = [1, 2, 3, 4] as const;
const RATING_STYLE = ["", "border-red-400 text-red-700 dark:text-red-300", "border-amber-400 text-amber-700 dark:text-amber-300", "border-green-500 text-green-700 dark:text-green-300", "border-sky-500 text-sky-700 dark:text-sky-300"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The context sentence with the word blanked out, or null if the word is not in it. */
function cloze(c: Card): string | null {
  if (!c.context) return null;
  const re = new RegExp(`\\b${esc(c.term)}\\w*`, "i");
  return re.test(c.context) ? c.context.replace(re, "_____") : null;
}

/** One review round: show the prompt for the chosen mode, reveal, rate with FSRS. Keys: space = reveal, 1–4 = rate. */
export default function ReviewSession({ doc }: { doc?: number }) {
  const t = useTranslations("review");
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [mode, setMode] = useState<Mode>("recognize");
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const started = useRef(Date.now());

  useEffect(() => {
    try {
      const m = localStorage.getItem("review_mode") as Mode | null;
      if (m && MODES.includes(m)) setMode(m);
    } catch {}
    fetch(`/api/review${doc ? `?doc=${doc}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setQueue)
      .catch(() => setQueue([]));
  }, [doc]);

  const card = queue?.[0];
  const effective: Mode = card && mode === "cloze" && !cloze(card) ? "recognize" : mode;

  useEffect(() => {
    started.current = Date.now();
    if (card && effective === "listen") speak(card.term);
  }, [card, effective]);

  const rate = useCallback(
    (rating: (typeof RATINGS)[number]) => {
      if (!card || !shown) return;
      fetch(`/api/review/${card.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, mode: effective, durationMs: Date.now() - started.current }),
      });
      // "Again" comes back at the end of this round
      setQueue((q) => (q ? (rating === 1 ? [...q.slice(1), q[0]] : q.slice(1)) : q));
      if (rating > 1) setDone((d) => d + 1);
      setShown(false);
    },
    [card, shown, effective],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,[contenteditable]")) return;
      if (e.key === " ") {
        e.preventDefault();
        setShown(true);
      } else if (["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as 1 | 2 | 3 | 4);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rate]);

  if (!queue) return <p className="text-muted">{t("loading")}</p>;
  if (!card)
    return (
      <div className="rounded-2xl border border-line bg-card p-6 text-center">
        <div className="text-4xl">🎉</div>
        <p className="mt-2 font-medium">{done ? t("finished", { n: done }) : t("nothing")}</p>
        <Link href="/words" className="mt-3 inline-block text-sm text-accent underline">
          {t("openNotebook")}
        </Link>
      </div>
    );

  const head = (
    <div className="flex flex-wrap items-baseline justify-center gap-x-2">
      <span className="font-serif text-3xl font-bold">{card.term}</span>
      {card.pos && <span className="text-sm font-semibold text-accent2">{card.pos}</span>}
      {card.ipa && <span className="text-muted">{card.ipa}</span>}
    </div>
  );
  const meaning = (
    <div className="text-center">
      {card.meaningVi && <div className="text-xl font-semibold text-accent">{card.meaningVi}</div>}
      {card.definitionEn && <div className="mt-1 text-muted">{card.definitionEn}</div>}
      {!card.meaningVi && !card.definitionEn && <div className="text-sm text-muted">{t("noMeaning")}</div>}
    </div>
  );
  const prompt = {
    recognize: head,
    recall: meaning,
    cloze: <p className="text-center font-serif text-xl leading-relaxed">{cloze(card)}</p>,
    listen: (
      <button onClick={() => speak(card.term)} className="mx-auto block rounded-2xl border border-line px-6 py-4 text-3xl" aria-label={t("listen")}>
        <I.IconSpeaker className="h-9 w-9" />
      </button>
    ),
  }[effective];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setShown(false);
              try {
                localStorage.setItem("review_mode", m);
              } catch {}
            }}
            className={`chip ${mode === m ? "chip-on" : ""}`}
          >
            {t(`modes.${m}`)}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted">{t("left", { n: queue.length })}</span>
      </div>

      <div className="rounded-3xl border border-line bg-card p-6 md:p-8">
        <div className="flex min-h-28 flex-col justify-center gap-3">{prompt}</div>
        {shown ? (
          <div className="mt-5 space-y-3 border-t border-line pt-5">
            {effective !== "recognize" && head}
            {effective !== "recall" && meaning}
            {card.images.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {card.images.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt={card.term} className="max-h-48 rounded-xl" />
                ))}
              </div>
            )}
            {card.context && <p className="rounded-xl bg-paper px-4 py-3 font-serif text-[15px] italic">“{card.context}”</p>}
            {card.example && <p className="text-sm italic"><I.IconQuote className="inline-block h-4 w-4 align-[-0.2em] text-muted" /> {card.example}</p>}
            {card.note && <p className="text-sm text-muted"><I.IconBulb className="inline-block h-4 w-4 align-[-0.2em]" /> {card.note}</p>}
            <div className="flex justify-center">
              <button onClick={() => speak(card.term)} className="btn btn-sm btn-secondary">
                <I.IconSpeaker className="inline-block h-4 w-4 align-[-0.2em]" /> {t("listen")}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShown(true)} className="mt-6 min-h-12 w-full rounded-2xl bg-accent font-medium text-on-accent">
            {t("show")} <span className="text-xs opacity-70">(Space)</span>
          </button>
        )}
      </div>

      {shown && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {RATINGS.map((r) => (
            <button key={r} onClick={() => rate(r)} className={`min-h-12 rounded-2xl border-2 bg-card text-sm font-medium ${RATING_STYLE[r]}`}>
              {t(`rating.${r}`)} <span className="block text-xs opacity-60">{r}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
