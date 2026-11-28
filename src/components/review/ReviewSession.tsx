"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { autoSpeak, speak, scopeAutoRead, setScopeAutoRead, setSpeakScope } from "@/lib/speech";
import * as I from "@/components/icons";
import { sfx } from "@/lib/sound";
import { norm, shuffle } from "@/components/practice/questions";
import { answerOk } from "./answer";
import QuickMix, { type QWord } from "@/components/learn/QuickMix";

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
  state: number; // 1 learning, 2 review, 3 relearning
  stability: number;
  next: number[]; // ms until due again for Again / Hard / Good / Easy
  images: string[];
};
type Mode = "recognize" | "recall" | "cloze" | "listen" | "image";
const MODES: Mode[] = ["recognize", "recall", "cloze", "listen", "image"];
type Method = "flip" | "answer" | "mix";
type Prefs = { method: Method; mode: Mode; ask: "en" | "vi"; kind: "type" | "mc"; autoNext: boolean };
const PREFS: Prefs = { method: "flip", mode: "recognize", ask: "en", kind: "mc", autoNext: true };
export type Forecast = { due: number; learned: number; total: number; fresh: number; days: { day: string; n: number }[]; next: string | null };
export type PoolWord = { term: string; pos: string | null; meaningVi: string | null; definitionEn: string | null };
/** What was done with a card, for looking back with "previous". */
type Done = { card: Card; rating: number };

const RATINGS = [1, 2, 3, 4] as const;
const RATING_STYLE = [
  "",
  "border-red-400 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40",
  "border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40",
  "border-green-500 text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-950/40",
  "border-sky-500 text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40",
];
const SLOW = 8000;
const meaningOf = (c: { meaningVi: string | null; definitionEn: string | null }) => (c.meaningVi || c.definitionEn || "").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The context sentence with the word blanked out, or null if the word is not in it. */
function cloze(c: Card): string | null {
  if (!c.context) return null;
  const re = new RegExp(`\\b${esc(c.term)}\\w*`, "i");
  return re.test(c.context) ? c.context.replace(re, "_____") : null;
}
function loadPrefs(): Prefs {
  try {
    return { ...PREFS, ...JSON.parse(localStorage.getItem("review_prefs") ?? "{}") };
  } catch {
    return PREFS;
  }
}

/**
 * "Review today": a start screen with what is due and a 7-day forecast, then the due words in one of three ways –
 * flip a card and rate yourself (Anki-style), answer (typed or multiple choice, graded for you), or the mixed
 * questions of Quick study. FSRS schedules all of them.
 */
export default function ReviewSession({ doc, forecast, pool }: { doc?: number; forecast: Forecast; pool: PoolWord[] }) {
  const t = useTranslations("review");
  const locale = useLocale();
  const [prefs, setPrefs] = useState<Prefs>(PREFS);
  const [settings, setSettings] = useState(false);
  const [phase, setPhase] = useState<"start" | "run" | "end">("start");
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [mixWords, setMixWords] = useState<QWord[]>([]);
  const [history, setHistory] = useState<Done[]>([]);
  const [view, setView] = useState<number | null>(null);
  const [shown, setShown] = useState(false); // flip: back side; answer: feedback
  const [typed, setTyped] = useState("");
  const [given, setGiven] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const started = useRef(Date.now());
  const auto = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [autoRead, setAutoRead] = useState(true);
  useEffect(() => {
    setPrefs(loadPrefs());
    setAutoRead(scopeAutoRead("review"));
    setSpeakScope("review");
    return () => setSpeakScope(null);
  }, []);
  const save = (p: Prefs) => {
    setPrefs(p);
    try {
      localStorage.setItem("review_prefs", JSON.stringify(p));
    } catch {}
  };

  async function start() {
    const q = new URLSearchParams();
    if (doc) q.set("doc", String(doc));
    const r = await fetch(`/api/review${q.size ? `?${q}` : ""}`, { cache: "no-store" }).catch(() => null);
    const cards: Card[] = r?.ok ? await r.json() : [];
    setQueue(cards);
    // the mixed questions take about 10 words a round, like Quick study
    setMixWords(cards.slice(0, 10).map(({ images: _i, next: _n, ...w }) => w));
    setPhase("run");
  }

  const card = queue?.[0];
  const answering = prefs.method === "answer";
  const effective: Mode = card && ((prefs.mode === "cloze" && !cloze(card)) || (prefs.mode === "image" && !card.images.length)) ? "recognize" : prefs.mode;
  const rightAnswer = (c: Card) => (prefs.ask === "en" ? meaningOf(c) : c.term);
  const right = given !== null && card ? answerOk(given, card, prefs.ask) || norm(given) === norm(rightAnswer(card)) : false;

  // a new card: clock, sound, choices
  useEffect(() => {
    if (!card || phase !== "run" || prefs.method === "mix") return;
    started.current = Date.now();
    setShown(false);
    setGiven(null);
    setTyped("");
    if (answering) {
      const want = rightAnswer(card);
      const values = [...(queue ?? []).map(rightAnswer), ...pool.map((p) => (prefs.ask === "en" ? meaningOf(p) : p.term))];
      const others = shuffle([...new Set(values)].filter((x) => x && norm(x) !== norm(want))).slice(0, 3);
      setOptions(prefs.kind === "mc" && others.length === 3 ? shuffle([want, ...others]) : []);
      if (prefs.ask === "en") autoSpeak(card.term);
    } else if (effective === "listen") speak(card.term);
    else if (effective === "recognize") autoSpeak(card.term);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, history.length, phase, prefs.method, prefs.ask, prefs.kind]);

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

  const flip = useCallback(() => {
    if (!card || answering) return;
    sfx("flip");
    setShown((s) => !s);
    if (effective !== "recognize" && effective !== "listen") autoSpeak(card.term);
  }, [card, answering, effective]);

  const rate = useCallback(
    (rating: 1 | 2 | 3 | 4, mode: string = effective) => {
      if (!card || !queue) return;
      clearTimeout(auto.current);
      fetch(`/api/review/${card.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, mode, durationMs: Math.min(Date.now() - started.current, 3_600_000) }),
      }).catch(() => {});
      setHistory((h) => [...h, { card, rating }]);
      // "Again" comes back at the end of this round, like Anki's learning steps
      const rest = rating === 1 ? [...queue.slice(1), { ...card, state: card.state === 2 ? 3 : card.state }] : queue.slice(1);
      setQueue(rest);
      if (!rest.length) {
        sfx("done");
        setPhase("end");
      } else sfx(rating === 1 ? "wrong" : "tap");
    },
    [card, queue, effective],
  );

  function check(a: string) {
    if (!card || given !== null) return;
    setGiven(a);
    setShown(true);
    const ok = answerOk(a, card, prefs.ask) || norm(a) === norm(rightAnswer(card));
    sfx(ok ? "correct" : "wrong");
    if (prefs.ask === "vi") autoSpeak(card.term);
    if (ok && prefs.autoNext) auto.current = setTimeout(() => grade(true), 1200);
  }
  /** Answer mode: wrong → Again, slow → Hard, else Good; "I was right" counts as Good. */
  function grade(ok: boolean) {
    rate(!ok ? 1 : Date.now() - started.current > SLOW + 1200 ? 2 : 3, prefs.ask === "en" ? "recognize" : "recall");
  }

  /** Skip: this card goes to the end of the round (not graded). */
  function skip() {
    if (!queue || queue.length < 2) return;
    setQueue([...queue.slice(1), queue[0]]);
  }
  const back = () => history.length && setView(view === null ? history.length - 1 : Math.max(0, view - 1));
  const forward = () => (view !== null ? setView(view + 1 < history.length ? view + 1 : null) : answering && shown ? grade(right) : skip());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "run" || settings || prefs.method === "mix") return;
      if (e.key === "Tab" && answering && shown && !right) {
        e.preventDefault();
        return grade(true);
      }
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "ArrowLeft") back();
      else if (e.key === "ArrowRight") forward();
      else if (view !== null) return;
      else if (!answering && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        if (!shown) flip();
        else rate(3);
      } else if (!answering && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as 1 | 2 | 3 | 4);
      else if (answering && !shown && options.length && ["1", "2", "3", "4"].includes(e.key)) check(options[Number(e.key) - 1]);
      else if (answering && shown && e.key === "Enter") grade(right);
      else if (e.key.toLowerCase() === "r" && card) speak(card.term);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: "short" });
  const gear = (
    <button onClick={() => setSettings(true)} className="icon-btn" aria-label={t("settings.title")} title={t("settings.title")}>
      <I.IconGear />
    </button>
  );

  /* ---------- settings ---------- */
  const settingsBox = settings && (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setSettings(false)}>
      <div role="dialog" aria-modal="true" aria-label={t("settings.title")} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-card p-5 shadow-xl">
        <div className="flex items-center">
          <h2 className="flex-1 font-bold">{t("settings.title")}</h2>
          <button onClick={() => setSettings(false)} className="icon-btn" aria-label={t("settings.close")}>
            <I.IconX />
          </button>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t("settings.method")}</p>
          <div className="grid gap-2">
            {(["flip", "answer", "mix"] as const).map((m) => (
              <button key={m} onClick={() => save({ ...prefs, method: m })} className={`rounded-2xl border-2 p-3 text-left text-sm ${prefs.method === m ? "border-accent bg-accent/10" : "border-line"}`}>
                <b>{t(`settings.${m}`)}</b>
                <span className="mt-0.5 block text-xs text-muted">{t(`settings.${m}Hint`)}</span>
              </button>
            ))}
          </div>
        </div>
        {prefs.method === "flip" && (
          <div>
            <p className="mb-2 text-sm font-semibold">{t("settings.front")}</p>
            <div className="flex flex-wrap gap-1.5">
              {MODES.map((m) => (
                <button key={m} onClick={() => save({ ...prefs, mode: m })} className={`chip ${prefs.mode === m ? "chip-on" : ""}`}>
                  {t(`modes.${m}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        {prefs.method === "answer" && (
          <>
            <div>
              <p className="mb-2 text-sm font-semibold">{t("settings.ask")}</p>
              <div className="flex flex-wrap gap-1.5">
                {(["en", "vi"] as const).map((a) => (
                  <button key={a} onClick={() => save({ ...prefs, ask: a })} className={`chip ${prefs.ask === a ? "chip-on" : ""}`}>
                    {t(`settings.ask_${a}`)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">{t("settings.kind")}</p>
              <div className="flex flex-wrap gap-1.5">
                {(["mc", "type"] as const).map((k) => (
                  <button key={k} onClick={() => save({ ...prefs, kind: k })} className={`chip ${prefs.kind === k ? "chip-on" : ""}`}>
                    {t(`settings.kind_${k}`)}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs.autoNext} onChange={(e) => save({ ...prefs, autoNext: e.target.checked })} className="size-4" />
              {t("settings.autoNext")}
            </label>
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoRead}
            onChange={(e) => {
              setAutoRead(e.target.checked);
              setScopeAutoRead("review", e.target.checked);
            }}
            className="size-4"
          />
          {t("settings.autoRead")}
        </label>
        <button onClick={() => setSettings(false)} className="btn btn-primary w-full">
          {t("settings.done")}
        </button>
      </div>
    </div>
  );

  /* ---------- start ---------- */
  if (phase === "start") {
    const max = Math.max(1, ...forecast.days.map((d) => d.n));
    return (
      <div className="mx-auto max-w-2xl">
        {settingsBox}
        <div className="rounded-3xl border border-line bg-card p-5 md:p-6">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 font-bold">{t("start.title")}</h2>
            <span className="text-xs text-muted">{t(`settings.${prefs.method}`)}</span>
            {gear}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ["due", forecast.due, "text-accent"],
                ["learned", forecast.learned, "text-green-600 dark:text-green-400"],
                ["total", forecast.total, ""],
              ] as const
            ).map(([k, n, tone]) => (
              <div key={k} className="rounded-2xl bg-paper p-3">
                <p className="text-xs text-muted">{t(`start.${k}`)}</p>
                <p className={`text-2xl font-bold tabular-nums ${tone}`}>{n}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm font-semibold">{t("start.forecast")}</p>
          <div className="mt-2 flex h-28 items-end gap-2" role="img" aria-label={forecast.days.map((d) => `${weekday(d.day)}: ${d.n}`).join(", ")}>
            {forecast.days.map((d, i) => (
              <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs tabular-nums text-muted">{d.n || ""}</span>
                <div className={`w-full rounded-md ${i === 0 ? "bg-accent" : "bg-accent/35"}`} style={{ height: `${Math.max(4, (d.n / max) * 64)}px` }} />
                <span className={`text-xs ${i === 0 ? "font-semibold text-accent" : "text-muted"}`}>{i === 0 ? t("start.today") : weekday(d.day)}</span>
              </div>
            ))}
          </div>
          {forecast.due ? (
            <button onClick={start} autoFocus className="btn btn-lg btn-primary mt-5 w-full">
              <I.IconPlay /> {t("start.go", { n: forecast.due })}
            </button>
          ) : (
            <div className="mt-5 rounded-2xl bg-paper p-4 text-center">
              <p className="font-semibold">{t("start.none")}</p>
              {forecast.next && <p className="mt-1 text-sm text-muted">{t("start.next", { when: ivl(new Date(forecast.next).getTime() - Date.now()) })}</p>}
            </div>
          )}
          {forecast.fresh > 0 && (
            <Link href="/quick" className="btn btn-secondary mt-2 w-full">
              <I.IconBolt /> {t("start.learnNew", { n: forecast.fresh })}
            </Link>
          )}
        </div>
      </div>
    );
  }

  /* ---------- end ---------- */
  const endScreen = (n: number) => {
    const counts = [1, 2, 3, 4].map((r) => history.filter((h) => h.rating === r).length);
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-8 text-center">
        <I.BigIcon icon={n ? I.IconParty : I.IconCheckCircle} tone="green" />
        <p className="mt-2 text-lg font-semibold">{n ? t("finished", { n }) : t("nothingNow")}</p>
        {history.length > 0 && (
          <div className="mx-auto mt-4 grid max-w-sm grid-cols-4 gap-2 text-sm">
            {counts.map((k, i) => (
              <div key={i} className={`rounded-xl border-2 py-2 ${RATING_STYLE[i + 1]}`}>
                <b className="block text-lg tabular-nums">{k}</b>
                {t(`rating.${i + 1}`)}
              </div>
            ))}
          </div>
        )}
        <p className="mx-auto mt-4 max-w-md text-sm text-muted">{t("doneTip")}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {forecast.fresh > 0 && (
            <Link href="/quick" className="btn btn-primary">
              <I.IconBolt /> {t("start.learnNew", { n: forecast.fresh })}
            </Link>
          )}
          <Link href="/practice" className="btn btn-secondary">
            {t("toPractice")}
          </Link>
        </div>
      </div>
    );
  };
  if (!queue) return <p className="text-muted">{t("loading")}</p>;
  if (phase === "end") return endScreen(prefs.method === "mix" ? mixWords.length : new Set(history.map((h) => h.card.id)).size);

  /* ---------- mixed questions, as in Quick study ---------- */
  if (prefs.method === "mix")
    return mixWords.length ? (
      <div>
        {settingsBox}
        <div className="mx-auto mb-2 flex max-w-2xl justify-end">{gear}</div>
        <QuickMix kind="review" words={mixWords} others={pool} onDone={() => setPhase("end")} doneLabel={t("continue")} />
      </div>
    ) : (
      endScreen(0)
    );
  if (!card && view === null) return endScreen(0);

  /* ---------- a card (or one looked back at) ---------- */
  const old = view !== null ? history[view] : null;
  const c = old?.card ?? card!;
  const isBack = !!old || shown;
  const total = history.length + queue.length;
  const position = old ? view! + 1 : history.length + 1;
  const kind = c.state === 2 ? "review" : "learn";

  const head = (
    <div className="flex flex-wrap items-baseline justify-center gap-x-2">
      <span className="font-serif text-4xl font-bold">{c.term}</span>
      {c.pos && <span className="text-sm text-muted">{c.pos}</span>}
      {c.ipa && <span className="text-muted">{c.ipa}</span>}
    </div>
  );
  const details = (
    <div className="space-y-3">
      {c.images.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {c.images.slice(0, 2).map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt={c.term} className="max-h-36 rounded-xl" />
          ))}
        </div>
      )}
      <div className="text-center">
        {c.meaningVi && <div className="text-2xl font-bold">{c.meaningVi}</div>}
        {c.definitionEn && <div className="mt-1 text-sm text-muted">{c.definitionEn}</div>}
        {!c.meaningVi && !c.definitionEn && <div className="text-sm text-muted">{t("noMeaning")}</div>}
      </div>
      {c.context && (
        <p className="flex items-start gap-2 rounded-xl bg-paper px-4 py-3 font-serif text-[15px] italic">
          <span className="flex-1">“{c.context}”</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              speak(c.context!);
            }}
            className="icon-btn flex-none"
            aria-label={t("listen")}
          >
            <I.IconSpeaker />
          </button>
        </p>
      )}
      {c.example && (
        <p className="flex items-start gap-2 text-sm italic">
          <I.IconQuote className="h-4 w-4 flex-none text-muted" />
          <span className="flex-1">{c.example}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              speak(c.example!);
            }}
            className="icon-btn flex-none"
            aria-label={t("listen")}
          >
            <I.IconSpeaker />
          </button>
        </p>
      )}
      {c.mnemonic && (
        <p className="rounded-xl bg-highlight/60 px-4 py-2 text-center text-sm">
          <I.IconBulb className="inline-block h-4 w-4 align-[-0.2em]" /> {c.mnemonic}
        </p>
      )}
      {c.note && <p className="text-center text-sm text-muted">{c.note}</p>}
    </div>
  );
  const front = {
    recognize: head,
    recall: <div className="text-center text-2xl font-bold">{meaningOf(c) || t("noMeaning")}</div>,
    cloze: <p className="text-center font-serif text-xl leading-relaxed">{cloze(c)}</p>,
    image: (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={c.images[0]} alt="" className="mx-auto max-h-56 rounded-2xl object-contain" />
    ),
    listen: <I.IconSpeaker className="mx-auto h-12 w-12 text-accent" />,
  }[effective];

  return (
    <div className="mx-auto max-w-2xl">
      {settingsBox}
      <div className="mb-3 flex items-center gap-3 text-sm">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/70">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(history.length / total) * 100}%` }} />
        </div>
        {gear}
        <button onClick={() => setPhase("end")} className="btn btn-sm btn-ghost">
          {t("stop")}
        </button>
      </div>

      {/* the card: tap to flip (self-rating), or a question to answer */}
      <div
        onClick={() => !answering && !old && flip()}
        className={`rounded-3xl border bg-card p-5 shadow-sm md:p-8 ${old ? "border-dashed border-line" : "border-line"} ${!answering && !old ? "cursor-pointer" : ""}`}
      >
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${kind === "review" ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"}`}>{t(`kind.${kind}`)}</span>
          {old ? (
            <span className={`rounded-full border px-2 py-0.5 text-xs ${RATING_STYLE[old.rating]}`}>{t(`rating.${old.rating}`)}</span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <I.IconClock className="inline-block h-3 w-3 align-[-0.1em]" /> {t("dueTag")}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              speak(c.term);
            }}
            className="icon-btn ml-auto"
            aria-label={t("listen")}
          >
            <I.IconSpeaker />
          </button>
        </div>

        {answering && !old ? (
          <div className="mt-4">
            {prefs.ask === "en" ? head : <div className="text-center text-2xl font-bold">{meaningOf(c) || t("noMeaning")}</div>}
            <p className="mt-1 text-center text-xs text-muted">{t(`settings.ask_${prefs.ask}`)}</p>
            {options.length ? (
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {options.map((o, k) => {
                  const ok = norm(o) === norm(rightAnswer(c));
                  const tone = given === null ? "" : ok ? "border-green-500 bg-green-50 dark:bg-green-950/40" : o === given ? "border-red-500 bg-red-50 dark:bg-red-950/40" : "opacity-60";
                  return (
                    <button key={o} onClick={() => check(o)} disabled={given !== null} className={`flex items-center gap-2 rounded-2xl border border-line px-4 py-3 text-left hover:border-accent ${tone}`}>
                      <span className="text-xs text-muted">{k + 1}</span>
                      <span className="min-w-0 flex-1">{o}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typed.trim()) check(typed);
                }}
                className="mt-5"
              >
                <input
                  value={given ?? typed}
                  onChange={(e) => setTyped(e.target.value)}
                  readOnly={given !== null}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="off"
                  placeholder={t("typeHere")}
                  className={`field w-full text-center text-lg ${given === null ? "" : right ? "border-green-500" : "border-red-500"}`}
                />
                {given === null && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="submit" disabled={!typed.trim()} className="btn btn-primary">
                      {t("check")}
                    </button>
                    <button type="button" onClick={() => check("")} className="btn btn-secondary">
                      {t("dontKnow")}
                    </button>
                  </div>
                )}
              </form>
            )}
            {given !== null && (
              <div className={`mt-4 rounded-2xl p-4 ${right ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                <p className={`mb-3 font-semibold ${right ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"}`}>
                  {right ? `✓ ${t("right")}` : t("answerWas", { a: rightAnswer(c) })}
                </p>
                {prefs.ask === "vi" && head}
                {details}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 flex min-h-40 flex-col justify-center gap-4">
            {old ? head : !shown ? front : effective !== "recognize" ? head : front}
            {isBack ? <div className="border-t border-line pt-4">{details}</div> : <p className="text-center text-xs text-muted">{t("tapToFlip")}</p>}
          </div>
        )}
      </div>

      {/* rate (flip) or go on (answer) */}
      {/* always there: you may know it without flipping */}
      {!old && !answering && (
        <div className="mt-4">
          <p className="mb-2 text-center text-sm text-muted">{t("howWell")}</p>
          <div className="grid grid-cols-4 gap-2">
            {RATINGS.map((r) => (
              <button key={r} onClick={() => rate(r)} className={`min-h-14 rounded-2xl border-2 bg-card px-1 text-sm font-semibold transition-colors ${RATING_STYLE[r]}`}>
                {t(`rating.${r}`)}
                <span className="block text-xs font-normal opacity-80">{card!.next?.[r - 1] != null ? ivl(card!.next[r - 1]) : ""}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!old && answering && given !== null && (
        <div className="mt-4 grid gap-2">
          <button onClick={() => grade(right)} autoFocus className="btn btn-lg btn-primary">
            {t("continue")}
          </button>
          {!right && (
            <button onClick={() => grade(true)} className="btn btn-secondary">
              {t("iWasRight")} <kbd className="rounded bg-paper px-1.5 text-xs">Tab</kbd>
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <button onClick={back} disabled={!history.length || view === 0} className="btn btn-secondary" aria-label={t("prev")}>
          <I.IconArrowLeft />
        </button>
        <span className="text-sm text-muted">{t("cardOf", { n: position, total })}</span>
        <button onClick={forward} disabled={view === null && !(answering && shown) && queue.length < 2} className="btn btn-secondary" aria-label={t("next")}>
          <I.IconArrowRight />
        </button>
      </div>
      <p className="mt-3 hidden text-center text-xs text-muted md:block">{t(answering ? "keysAnswer" : shown ? "keysRate" : "keysShow")}</p>
    </div>
  );
}
