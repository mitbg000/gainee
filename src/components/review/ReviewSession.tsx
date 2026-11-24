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
  mnemonic: string | null;
  context: string | null;
  state: number; // 0 new, 1 learning, 2 review, 3 relearning
  next: number[]; // ms until due again for Again / Hard / Good / Easy
  images: string[];
};
type Mode = "recognize" | "recall" | "cloze" | "listen";
const MODES: Mode[] = ["recognize", "recall", "cloze", "listen"];
const RATINGS = [1, 2, 3, 4] as const;
const RATING_STYLE = [
  "",
  "border-red-400 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40",
  "border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40",
  "border-green-500 text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-950/40",
  "border-sky-500 text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40",
];
/** Anki's queue colours: new = blue, learning = red, review = green. */
const KIND = (state: number) => (state === 0 ? "new" : state === 2 ? "review" : "learn");
const KIND_STYLE = { new: "text-sky-600 dark:text-sky-400", learn: "text-red-600 dark:text-red-400", review: "text-green-700 dark:text-green-400" };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The context sentence with the word blanked out, or null if the word is not in it. */
function cloze(c: Card): string | null {
  if (!c.context) return null;
  const re = new RegExp(`\\b${esc(c.term)}\\w*`, "i");
  return re.test(c.context) ? c.context.replace(re, "_____") : null;
}
/** "p _ _ _ _ _ _ e" – first and last letter, the rest as blanks. */
const letters = (term: string) => term.split(" ").map((w) => (w.length <= 2 ? w[0] + " _" : `${w[0]} ${"_ ".repeat(w.length - 2)}${w[w.length - 1]}`)).join("   ");

/** limit + onDone: a short round inside "Quick study", which moves on when the cards are done. */
export default function ReviewSession({ doc, limit, onDone }: { doc?: number; limit?: number; onDone?: () => void }) {
  const t = useTranslations("review");
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [mode, setMode] = useState<Mode>("recognize");
  const [shown, setShown] = useState(false);
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState(0);
  const started = useRef(Date.now());

  useEffect(() => {
    try {
      const m = localStorage.getItem("review_mode") as Mode | null;
      if (m && MODES.includes(m)) setMode(m);
    } catch {}
    const q = new URLSearchParams();
    if (doc) q.set("doc", String(doc));
    if (limit) q.set("limit", String(limit));
    fetch(`/api/review${q.size ? `?${q}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setQueue)
      .catch(() => setQueue([]));
  }, [doc, limit]);

  const card = queue?.[0];
  const effective: Mode = card && mode === "cloze" && !cloze(card) ? "recognize" : mode;

  useEffect(() => {
    started.current = Date.now();
    setHint(false);
    if (card && effective === "listen") speak(card.term);
  }, [card, effective]);

  /** "<1 min", "10 min", "3 d", "2 mo" */
  const ivl = (ms: number) => {
    const m = ms / 60000;
    if (m < 1) return t("ivl.lt1");
    if (m < 60) return t("ivl.min", { n: Math.round(m) });
    if (m < 60 * 24) return t("ivl.hour", { n: Math.round(m / 60) });
    if (m < 60 * 24 * 30) return t("ivl.day", { n: Math.round(m / 1440) });
    if (m < 60 * 24 * 365) return t("ivl.month", { n: Math.round(m / 43200) });
    return t("ivl.year", { n: Math.round(m / 52560) / 10 });
  };

  const rate = useCallback(
    (rating: (typeof RATINGS)[number]) => {
      if (!card || !shown) return;
      const id = card.id;
      fetch(`/api/review/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, mode: effective, durationMs: Date.now() - started.current }),
      })
        .then((r) => (r.ok ? r.json() : null))
        // a card that came back into this round shows its new intervals
        .then((r: { state: number; next: number[] } | null) => r && setQueue((q) => q?.map((c) => (c.id === id ? { ...c, state: r.state, next: r.next } : c)) ?? q))
        .catch(() => {});
      // "Again" comes back at the end of this round, like Anki's learning steps
      setQueue((q) => (q ? (rating === 1 ? [...q.slice(1), { ...q[0], state: q[0].state === 2 ? 3 : q[0].state || 1 }] : q.slice(1)) : q));
      if (rating > 1) setDone((d) => d + 1);
      setShown(false);
    },
    [card, shown, effective],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!shown) setShown(true);
        else rate(3);
      } else if (e.key.toLowerCase() === "h") setHint(true);
      else if (e.key.toLowerCase() === "r" && card) speak(card.term);
      else if (["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as 1 | 2 | 3 | 4);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rate, shown, card]);

  if (!queue) return <p className="text-muted">{t("loading")}</p>;
  if (!card && onDone)
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-8 text-center">
        <p className="text-4xl">✅</p>
        <p className="mt-2 text-lg font-semibold">{done ? t("finished", { n: done }) : t("nothingNow")}</p>
        <button onClick={onDone} autoFocus className="btn btn-primary mt-4">
          {t("continue")}
        </button>
      </div>
    );
  if (!card)
    return (
      <div className="rounded-3xl border border-line bg-card p-8 text-center">
        <div className="text-4xl">🎉</div>
        <p className="mt-2 text-lg font-semibold">{done ? t("finished", { n: done }) : t("nothing")}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">{t("doneTip")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/practice" className="btn btn-primary">
            {t("toPractice")}
          </Link>
          <Link href="/words" className="btn btn-secondary">
            {t("openNotebook")}
          </Link>
        </div>
      </div>
    );

  const counts = { new: 0, learn: 0, review: 0 };
  for (const c of queue) counts[KIND(c.state)]++;
  const total = done + queue.length;

  const head = (
    <div className="flex flex-wrap items-baseline justify-center gap-x-2">
      <span className="font-serif text-4xl font-bold">{card.term}</span>
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
      <button onClick={() => speak(card.term)} className="mx-auto flex size-20 items-center justify-center rounded-full border border-line hover:border-accent" aria-label={t("listen")}>
        <I.IconSpeaker className="h-9 w-9" />
      </button>
    ),
  }[effective];
  // a nudge that does not give the answer away: the word's shape, or the sentence it came from
  const hintText = effective === "recognize" ? (card.context ?? card.example ?? card.pos) : letters(card.term);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
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
      </div>

      {/* Anki-style counters + progress */}
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="flex gap-3 font-semibold tabular-nums">
          {(["new", "learn", "review"] as const).map((k) => (
            <span key={k} title={t(`kind.${k}`)} className={`${KIND_STYLE[k]} ${KIND(card.state) === k ? "underline underline-offset-4" : ""}`}>
              {counts[k]} <span className="font-normal text-muted">{t(`kind.${k}`)}</span>
            </span>
          ))}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/70">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <span className="tabular-nums text-muted">
          {done}/{total}
        </span>
      </div>

      <div className="rounded-3xl border border-line bg-card p-6 shadow-sm md:p-10">
        <div className="flex min-h-36 flex-col justify-center gap-3">{prompt}</div>
        {!shown && hint && hintText && <p className="mt-3 text-center font-serif text-lg tracking-wide text-muted">{hintText}</p>}
        {shown && (
          <div className="mt-6 space-y-3 border-t border-line pt-6">
            {effective !== "recognize" && head}
            {effective !== "recall" && meaning}
            {card.mnemonic && (
              <p className="rounded-xl bg-highlight/60 px-4 py-2 text-center text-sm">
                <I.IconBulb className="inline-block h-4 w-4 align-[-0.2em]" /> {card.mnemonic}
              </p>
            )}
            {card.images.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {card.images.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt={card.term} className="max-h-48 rounded-xl" />
                ))}
              </div>
            )}
            {card.context && <p className="rounded-xl bg-paper px-4 py-3 font-serif text-[15px] italic">“{card.context}”</p>}
            {card.example && (
              <p className="text-sm italic">
                <I.IconQuote className="inline-block h-4 w-4 align-[-0.2em] text-muted" /> {card.example}
              </p>
            )}
            {card.note && <p className="text-sm text-muted">{card.note}</p>}
            <div className="flex justify-center">
              <button onClick={() => speak(card.term)} className="btn btn-sm btn-secondary">
                <I.IconSpeaker className="inline-block h-4 w-4 align-[-0.2em]" /> {t("listen")}
              </button>
            </div>
          </div>
        )}
      </div>

      {shown ? (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {RATINGS.map((r) => (
            <button key={r} onClick={() => rate(r)} className={`min-h-14 rounded-2xl border-2 bg-card px-1 text-sm font-semibold transition-colors ${RATING_STYLE[r]}`}>
              <span className="block text-xs font-normal opacity-80">{card.next?.[r - 1] != null ? ivl(card.next[r - 1]) : ""}</span>
              {t(`rating.${r}`)}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          {hintText && !hint && (
            <button onClick={() => setHint(true)} className="btn btn-lg btn-secondary">
              {t("hint")}
            </button>
          )}
          <button onClick={() => setShown(true)} className="btn btn-lg btn-primary flex-1">
            {t("show")}
          </button>
        </div>
      )}
      <p className="mt-3 hidden text-center text-xs text-muted md:block">{t(shown ? "keysRate" : "keysShow")}</p>
    </div>
  );
}
