"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as I from "@/components/icons";
import StepNav from "@/components/StepNav";
import { firstLetters, gapWords, mark, sameWord, type Marked } from "@/lib/listen/check";
import { sfx } from "@/lib/sound";
import type { PlayItem } from "@/lib/listen/queries";
import { ListenLayout, LookupText, useLookup } from "./Lookup";
import { prefetchClip, useClipPlayer } from "./useClipPlayer";
import { ask } from "@/components/Toaster";

const json = (body: unknown) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const SPEEDS = [0.75, 1, 1.25];

type Props = {
  items: PlayItem[];
  titles: Record<number, string>;
  saved: { id: number; term: string }[];
  mode: "random" | "review" | "source";
  kind: "dictation" | "gaps";
  /** "source" mode: the recording, and where to go on from (its next sentence is remembered) */
  sourceId?: number;
  startIdx?: number;
  round?: { n: number; done: number; total: number };
  backHref: string;
  /** where this session's progress is kept in the browser, to go on from the same sentence next time */
  resumeKey?: string;
  /** start over: forget the kept progress */
  restart?: boolean;
};

type Saved = { at: number; queue: PlayItem[]; i: number; kept: [number, Cur][]; done: number[] };
const KEEP_DAYS = 7;
const readSaved = (key?: string): Saved | null => {
  if (!key) return null;
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null") as Saved | null;
    return v && Date.now() - v.at < KEEP_DAYS * 86_400_000 && v.queue?.length && v.i < v.queue.length ? v : null;
  } catch {
    return null;
  }
};
const forget = (key?: string) => {
  try {
    if (key) localStorage.removeItem(key);
  } catch {}
};

type Cur = {
  typed: string;
  gaps: string[];
  checks: number;
  firstOk: boolean | null;
  firstMisses: Record<string, number>;
  hinted: boolean;
  letters: boolean;
  shown: number[];
  revealed: boolean;
  marked: Marked | null;
  gapRight: boolean[] | null;
  done: boolean;
  startedAt: number;
};
const fresh = (): Cur => ({ typed: "", gaps: [], checks: 0, firstOk: null, firstMisses: {}, hinted: false, letters: false, shown: [], revealed: false, marked: null, gapRight: null, done: false, startedAt: Date.now() });

/**
 * Dictation, one sentence at a time: listen, type, check. A sentence is only done when it is typed fully right, also
 * after a hint or after showing the answer (pasting is blocked). The first check and the hints decide the review
 * schedule; wrong sentences come back at the end of the session when "again until right" is on.
 */
export default function Practice(p: Props) {
  const t = useTranslations("listen.practice");
  const player = useClipPlayer();
  const look = useLookup(p.saved);
  const [queue, setQueue] = useState<PlayItem[]>(() => (p.mode === "source" ? p.items.filter((x) => x.idx >= (p.startIdx ?? 0)) : p.items));
  const [i, setI] = useState(0);
  const [cur, setCur] = useState<Cur>(fresh);
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [speed, setSpeed] = useState(1);
  const [relearn, setRelearn] = useState(p.mode !== "source");
  const [editing, setEditing] = useState<string | null>(null);
  const [stats, setStats] = useState({ clean: 0, fixed: 0, hinted: 0, skipped: 0 });
  const recorded = useRef(new Set<number>());
  // what was written at each place of the queue, so going back shows it again (by place: a sentence asked again at
  // the end of the session starts empty)
  const kept = useRef(new Map<number, Cur>());
  const [doneIds, setDoneIds] = useState<Set<number>>(() => new Set());
  const doneBox = useRef<HTMLOListElement>(null);
  const requeued = useRef(new Set<number>());
  const seconds = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const [resumed, setResumed] = useState<{ n: number; total: number } | null>(null); // where last time stopped

  // left half way last time: the same sentences, at the same place, with what was written
  useEffect(() => {
    if (p.restart) return forget(p.resumeKey);
    const v = readSaved(p.resumeKey);
    if (!v) return;
    const latest = new Map(p.items.map((x) => [x.id, x])); // current words, in case a sentence was fixed since
    kept.current = new Map(v.kept);
    setQueue(v.queue.map((x) => latest.get(x.id) ?? x));
    setDoneIds(new Set(v.done));
    setI(v.i);
    if (v.i > 0 || v.kept.length > 0) setResumed({ n: v.i + 1, total: v.queue.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);
  // kept on every change; gone once the session is finished
  useEffect(() => {
    if (!p.resumeKey) return;
    if (i >= queue.length) return forget(p.resumeKey);
    const all = new Map(kept.current).set(i, cur);
    try {
      localStorage.setItem(p.resumeKey, JSON.stringify({ at: Date.now(), queue, i, kept: [...all], done: [...doneIds] } satisfies Saved));
    } catch {}
  }, [p.resumeKey, queue, i, cur, doneIds]);

  const item = queue[i];
  const text = item ? (texts[item.id] ?? item.text) : "";
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const blanks = useMemo(() => (p.kind === "gaps" ? gapWords(text) : []), [p.kind, text]);
  const isVideo = item?.media.kind === "youtube";

  useEffect(() => {
    try {
      const v = localStorage.getItem("rl_listen_relearn");
      if (v !== null && p.mode !== "source") setRelearn(v === "1");
    } catch {}
  }, [p.mode]);

  const replay = useCallback(() => item && player.play({ media: item.media, start: item.start, end: item.end }, speed), [item, player, speed]);

  // a new sentence: fresh state, play it, focus the box
  useEffect(() => {
    setCur(kept.current.get(i) ?? fresh());
    setEditing(null);
    look.setTool(null);
    if (!item) return;
    const id = setTimeout(() => {
      replay();
      input.current?.focus();
      const after = queue[i + 1];
      if (after) prefetchClip({ media: after.media, start: after.start, end: after.end });
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the sentence changes
  }, [item?.id, i]);

  // the newest written sentence in view
  useEffect(() => {
    doneBox.current?.scrollTo({ top: doneBox.current.scrollHeight });
  }, [doneIds]);

  // the end of the session: a short fanfare
  useEffect(() => {
    if (!item && queue.length) sfx("done");
  }, [item, queue.length]);

  // Ctrl pressed and released alone: listen again
  useEffect(() => {
    let alone = false;
    const down = (e: KeyboardEvent) => (alone = e.key === "Control");
    const up = (e: KeyboardEvent) => {
      if (e.key === "Control" && alone) replay();
      alone = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [replay]);

  // done: Enter goes on (the answer box is gone, so listen on the page)
  useEffect(() => {
    if (!cur.done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (e.target as HTMLElement).closest("textarea, input")) return;
      e.preventDefault();
      next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function finish(c: Cur) {
    setDoneIds((d) => new Set(d).add(item.id));
    setTimeout(replay, 450); // once more while the words are on screen, after the "right" sound
    seconds.current += Math.min(180, (Date.now() - c.startedAt) / 1000);
    const minutes = Math.floor(seconds.current / 60);
    seconds.current -= minutes * 60;
    const firstTime = !recorded.current.has(item.id);
    if (firstTime) {
      recorded.current.add(item.id);
      fetch(`/api/listen/items/${item.id}/result`, { method: "POST", ...json({ first: !!c.firstOk, hinted: c.hinted, misses: c.firstMisses, mode: p.mode, minutes }) });
      setStats((s) => ({ ...s, ...(c.hinted ? { hinted: s.hinted + 1 } : c.firstOk ? { clean: s.clean + 1 } : { fixed: s.fixed + 1 }) }));
    } else if (minutes) fetch(`/api/listen/time`, { method: "POST", ...json({ minutes }) });
    // again at the end of the session, until it is right at once
    if (relearn && (!c.firstOk || c.hinted) && !requeued.current.has(item.id) && p.mode !== "source") {
      requeued.current.add(item.id);
      setQueue((q) => [...q, item]);
    }
  }

  function check() {
    if (!item || cur.done) return;
    let m: Marked;
    let gapRight: boolean[] | null = null;
    if (p.kind === "gaps") {
      gapRight = blanks.map((k, j) => sameWord(words[k], cur.gaps[j] ?? ""));
      m = mark(text, words.map((w, k) => (blanks.includes(k) ? cur.gaps[blanks.indexOf(k)] ?? "" : w)).join(" "));
      m = { ...m, ok: gapRight.every(Boolean) };
    } else m = mark(text, cur.typed);
    const c: Cur = { ...cur, checks: cur.checks + 1, marked: m, gapRight, done: m.ok, firstOk: cur.firstOk ?? m.ok, firstMisses: cur.checks ? cur.firstMisses : m.misses };
    setCur(c);
    sfx(m.ok ? "correct" : "wrong");
    if (m.ok) finish(c);
  }

  function next() {
    if (!item) return;
    if (p.mode === "source" && p.sourceId) fetch(`/api/listen/sources/${p.sourceId}`, { method: "PATCH", ...json({ position: i + 1 < queue.length ? queue[i + 1].idx : 0 }) });
    kept.current.set(i, cur);
    setI(i + 1);
  }

  async function report() {
    if (!await ask(t("reportConfirm"))) return;
    await fetch(`/api/listen/items/${item.id}`, { method: "PATCH", ...json({ hidden: true }) });
    setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
    recorded.current.add(item.id);
    next();
  }

  async function saveEdit() {
    if (!editing?.trim()) return;
    await fetch(`/api/listen/items/${item.id}`, { method: "PATCH", ...json({ text: editing.trim() }) });
    setTexts((x) => ({ ...x, [item.id]: editing.trim() }));
    setEditing(null);
    setCur((c) => ({ ...c, marked: null, gapRight: null }));
  }

  const hint = (h: "letters" | "word" | "all") => {
    sfx("tap");
    setCur((c) => {
      if (h === "letters") return { ...c, hinted: true, letters: true };
      if (h === "all") return { ...c, hinted: true, revealed: true };
      const pool = p.kind === "gaps" ? blanks : words.map((_, k) => k);
      const k = pool.find((x) => !c.shown.includes(x) && !(p.kind === "gaps" ? c.gapRight?.[blanks.indexOf(x)] : c.marked?.right[x]));
      return k === undefined ? c : { ...c, hinted: true, shown: [...c.shown, k] };
    });
  };

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (cur.done) next();
    else check();
  };
  const noPaste = (e: React.ClipboardEvent | React.DragEvent) => e.preventDefault();

  /* ---------- finished ---------- */
  if (!item) {
    const total = stats.clean + stats.fixed + stats.hinted;
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-line bg-card p-6 text-center">
        <I.IconParty className="mx-auto h-10 w-10 text-accent" />
        <h2 className="mt-2 font-serif text-2xl font-bold">{t("finished")}</h2>
        <p className="mt-2 text-sm text-muted">{t("summary", { total, clean: stats.clean, fixed: stats.fixed, hinted: stats.hinted })}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href={p.backHref} className="btn btn-secondary">
            <I.IconArrowLeft /> {t("back")}
          </Link>
          <button onClick={() => location.reload()} className="btn btn-primary">
            <I.IconRefresh /> {t("again")}
          </button>
        </div>
      </div>
    );
  }

  const hintLine =
    cur.letters || cur.shown.length
      ? words.map((w, k) => (cur.shown.includes(k) || (p.kind === "gaps" && !blanks.includes(k)) ? w : cur.letters ? firstLetters(w) : "·".repeat(Math.min(8, w.length)))).join(" ")
      : null;

  const progress = (
    <span className="flex flex-none items-center gap-2 text-xs text-muted">
      {item.due && <span className="chip">{t("reviewChip")}</span>}
      {p.round && <span className="hidden sm:inline">{t("round", p.round)}</span>}
    </span>
  );
  // a video's sentences written so far: done in this session, or (whole video) before where it was started
  const doneList = isVideo ? p.items.filter((x) => x.sourceId === item.sourceId && x.id !== item.id && (doneIds.has(x.id) || (p.mode === "source" && x.idx < (p.startIdx ?? 0)))).sort((a, b) => a.idx - b.idx) : [];
  const media = (
    <>
      {/* the video stays visible while learning */}
      <div ref={player.videoBox} className={`aspect-video w-full overflow-hidden rounded-2xl bg-black ${isVideo ? "" : "hidden"}`} />
      {isVideo && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="min-w-0 flex-1 truncate font-medium text-ink">{p.titles[item.sourceId]}</span>
          {progress}
        </div>
      )}
      {/* on a computer: the sentences written so far under the video, to read back, replay and look words up */}
      {doneList.length > 0 && (
        <section className="hidden rounded-2xl border border-line bg-card lg:block">
          <h2 className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("doneSoFar", { n: doneList.length })}</h2>
          <ol ref={doneBox} className="max-h-[40vh] space-y-1 overflow-y-auto p-2">
            {doneList.map((x) => (
              <li key={x.id} className="flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-paper">
                <button onClick={() => player.play({ media: x.media, start: x.start, end: x.end }, speed)} className="icon-btn mt-0.5 size-7 flex-none" aria-label={t("listen")}>
                  <I.IconPlay className="h-3.5 w-3.5" />
                </button>
                <LookupText text={texts[x.id] ?? x.text} onLookup={look.setTool} className="min-w-0 font-serif text-[15px] leading-relaxed" />
              </li>
            ))}
          </ol>
        </section>
      )}
      {!isVideo && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 text-sm">
          <I.IconHeadphones className="h-6 w-6 flex-none text-accent" />
          <span className="min-w-0 flex-1 truncate">{p.titles[item.sourceId]}</span>
          {player.loading ? <span className="text-muted">{t("loadingAudio")}</span> : progress}
        </div>
      )}
      {player.failed && <p className="text-sm text-red-600">{t("playFailed")}</p>}
    </>
  );

  return (
    <ListenLayout media={media} video={isVideo} side={look.panel(item.sourceId)}>
      <div className="space-y-4">
        {resumed && (
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-sm">
            <I.IconRefresh className="h-4 w-4 flex-none text-accent" />
            <span className="flex-1">{t("resumed", resumed)}</span>
            <button
              onClick={() => {
                forget(p.resumeKey);
                location.reload();
              }}
              className="btn btn-sm btn-ghost"
            >
              {t("startOver")}
            </button>
          </p>
        )}

        <div className="rounded-2xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={replay} className="btn btn-primary" title={t("replayKey")}>
              <I.IconPlay /> {player.playing ? t("playing") : t("listen")}
            </button>
            <span role="group" className="inline-flex overflow-hidden rounded-lg border border-line">
              {SPEEDS.map((s) => (
                <button key={s} onClick={() => setSpeed(s)} aria-pressed={speed === s} className={`min-h-9 px-2.5 text-sm ${speed === s ? "bg-accent/15 font-semibold" : "text-muted hover:bg-paper"}`}>
                  {s}×
                </button>
              ))}
            </span>
            {item.speaker && <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-muted">{item.speaker}</span>}
          </div>

          {hintLine && !cur.done && <p className="mt-3 rounded-lg bg-paper px-3 py-2 font-serif tracking-wide text-muted">{hintLine}</p>}

          {/* answer box */}
          {p.kind === "gaps" ? (
            <p className="mt-3 font-serif text-lg leading-loose">
              {words.map((w, k) => {
                const j = blanks.indexOf(k);
                if (j < 0) return <span key={k}>{w} </span>;
                const right = cur.gapRight?.[j];
                return (
                  <span key={k}>
                    <input
                      value={cur.gaps[j] ?? ""}
                      ref={j === 0 ? (el) => void (input.current = el as unknown as HTMLTextAreaElement) : undefined}
                      onChange={(e) => setCur((c) => ({ ...c, gaps: Object.assign([...c.gaps], { [j]: e.target.value }) }))}
                      onKeyDown={onEnter}
                      onPaste={noPaste}
                      onDrop={noPaste}
                      readOnly={cur.done}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      style={{ width: `${Math.max(5, w.length + 2)}ch` }}
                      className={`mx-0.5 rounded-md border-b-2 bg-paper px-1 text-center font-sans text-base outline-none ${right === true ? "border-green-500" : right === false ? "border-red-500" : "border-accent"}`}
                    />{" "}
                  </span>
                );
              })}
            </p>
          ) : (
            !cur.done && (
              <textarea
                ref={input}
                value={cur.typed}
                onChange={(e) => setCur((c) => ({ ...c, typed: e.target.value }))}
                onKeyDown={onEnter}
                onPaste={noPaste}
                onDrop={noPaste}
                rows={2}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={t("typeHere")}
                className="field mt-3 w-full resize-none font-serif text-lg"
              />
            )
          )}

          {/* what was right / wrong, in the learner's own words */}
          {cur.marked && !cur.done && p.kind === "dictation" && (
            <p className="mt-2 font-serif text-lg leading-relaxed">
              {cur.marked.shown.map((s, k) =>
                s.kind === "missing" ? (
                  <span key={k} className="mx-0.5 rounded bg-line/60 px-1 font-sans text-sm text-muted">
                    {"___ ".repeat(s.n).trim()}
                  </span>
                ) : (
                  <span key={k} className={s.kind === "ok" ? "text-green-700 dark:text-green-400" : s.kind === "wrong" ? "text-red-600 line-through decoration-1 dark:text-red-400" : "text-amber-600 line-through"}>
                    {s.text}{" "}
                  </span>
                ),
              )}
            </p>
          )}
          {cur.marked && !cur.done && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{t("notYet")}</p>}

          {/* the sentence: once written right, or when asked for (still to be typed) */}
          {(cur.done || cur.revealed) && (
            <div className={`mt-3 rounded-xl p-3 ${cur.done ? "bg-green-50 dark:bg-green-950/40" : "bg-paper"}`}>
              {cur.done && (
                <p className="mb-1 text-sm font-semibold text-green-700 dark:text-green-400">
                  <I.IconCheck className="inline-block h-4 w-4 align-[-0.2em]" /> {cur.firstOk && !cur.hinted ? t("rightFirst") : t("right")}
                </p>
              )}
              {!cur.done && <p className="mb-1 text-xs text-muted">{t("revealedHint")}</p>}
              <LookupText text={text} onLookup={look.setTool} className="font-serif text-lg leading-relaxed" />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {cur.done ? (
              <button onClick={next} className="btn btn-primary">
                {t("next")} <I.IconArrowRight />
              </button>
            ) : (
              <>
                <button onClick={check} className="btn btn-primary">
                  <I.IconEnter /> {t("check")}
                </button>
                <button onClick={() => hint("letters")} disabled={cur.letters} className="btn btn-sm btn-secondary">
                  {t("hintLetters")}
                </button>
                <button onClick={() => hint("word")} className="btn btn-sm btn-secondary">
                  {t("hintWord")}
                </button>
                <button onClick={() => hint("all")} disabled={cur.revealed} className="btn btn-sm btn-secondary">
                  <I.IconEye /> {t("hintAll")}
                </button>
              </>
            )}
          </div>

          <StepNav n={i + 1} total={queue.length} onPrev={() => (kept.current.set(i, cur), setI(i - 1))} onNext={next} className="-mx-1 mt-4 border-t border-line pt-3" />
        </div>

        {/* the captions can be wrong (automatic ones especially): fix the sentence, or report it */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {editing === null ? (
            <>
              <button onClick={() => setEditing(text)} className="btn btn-sm btn-ghost">
                <I.IconEdit /> {t("edit")}
              </button>
              <button onClick={report} className="btn btn-sm btn-ghost">
                <I.IconAlert /> {t("report")}
              </button>
            </>
          ) : (
            <div className="w-full space-y-2">
              <p className="text-xs text-muted">{t("editHint")}</p>
              <textarea value={editing} onChange={(e) => setEditing(e.target.value)} rows={2} className="field w-full" />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="btn btn-sm btn-primary">
                  {t("save")}
                </button>
                <button onClick={() => setEditing(null)} className="btn btn-sm btn-secondary">
                  {t("cancel")}
                </button>
              </div>
            </div>
          )}
          {p.mode !== "source" && (
            <label className="ml-auto flex items-center gap-1.5 text-muted">
              <input
                type="checkbox"
                checked={relearn}
                onChange={(e) => {
                  setRelearn(e.target.checked);
                  try {
                    localStorage.setItem("rl_listen_relearn", e.target.checked ? "1" : "0");
                  } catch {}
                }}
              />
              {t("relearn")}
            </label>
          )}
        </div>
        <p className="hidden text-xs text-muted md:block">{t("keys")}</p>
      </div>
    </ListenLayout>
  );
}
