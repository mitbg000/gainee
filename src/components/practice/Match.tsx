"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { meaningOf, shuffle, type PWord } from "./questions";

const PAIRS = 6;
const PENALTY = 1000; // ms added for a wrong pair, as in Quizlet's Match
type Tile = { key: string; id: number; text: string; isTerm: boolean };

function deal(words: PWord[]): Tile[] {
  const pick = shuffle(words.filter((w) => meaningOf(w))).slice(0, PAIRS);
  return shuffle(pick.flatMap((w) => [
    { key: `t${w.id}`, id: w.id, text: w.term, isTerm: true },
    { key: `m${w.id}`, id: w.id, text: meaningOf(w).slice(0, 80), isTerm: false },
  ]));
}

/** Match game: pair each word with its meaning as fast as possible; the best time is kept on this device. */
export default function Match({ words, onExit }: { words: PWord[]; onExit: () => void }) {
  const t = useTranslations("practice.match");
  const [tiles, setTiles] = useState<Tile[]>(() => deal(words));
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [pick, setPick] = useState<Tile | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const [start, setStart] = useState(() => Date.now());
  const [penalty, setPenalty] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [best, setBest] = useState<number | null>(null);
  const pairs = tiles.length / 2;
  const finished = pairs > 0 && gone.size === pairs;
  const time = now - start + penalty;

  useEffect(() => {
    try {
      const b = Number(localStorage.getItem("match_best"));
      if (b > 0) setBest(b);
    } catch {}
  }, []);
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [finished]);
  useEffect(() => {
    if (!finished || pairs < PAIRS) return; // only full boards count for the record
    const total = now - start + penalty;
    if (best === null || total < best) {
      setBest(total);
      try {
        localStorage.setItem("match_best", String(total));
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function choose(tile: Tile) {
    if (gone.has(tile.id) || bad.length) return;
    if (!pick || pick.key === tile.key) return setPick(pick?.key === tile.key ? null : tile);
    if (pick.id === tile.id && pick.isTerm !== tile.isTerm) {
      setGone((g) => new Set(g).add(tile.id));
      setPick(null);
      if (gone.size + 1 === pairs) setNow(Date.now());
    } else {
      setBad([pick.key, tile.key]);
      setPenalty((p) => p + PENALTY);
      setTimeout(() => {
        setBad([]);
        setPick(null);
      }, 450);
    }
  }
  function again() {
    setTiles(deal(words));
    setGone(new Set());
    setPick(null);
    setPenalty(0);
    setStart(Date.now());
    setNow(Date.now());
  }
  const sec = (ms: number) => (ms / 1000).toFixed(1);

  if (pairs < 2) return <p className="text-muted">{t("tooFew")}</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-mono text-2xl font-semibold tabular-nums">{sec(time)}s</span>
        <span className="text-muted">
          {best !== null && t("best", { s: sec(best) })}
          {penalty > 0 && <span className="ml-2 text-red-600 dark:text-red-400">+{penalty / 1000}s</span>}
        </span>
      </div>

      {finished ? (
        <div className="rounded-3xl border border-line bg-card p-8 text-center">
          <p className="text-4xl">⚡</p>
          <p className="mt-2 font-serif text-2xl font-bold">{t("done", { s: sec(time) })}</p>
          {best !== null && best === time && pairs === PAIRS && <p className="mt-1 font-semibold text-green-700 dark:text-green-400">{t("record")}</p>}
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={again} autoFocus className="btn btn-primary">
              {t("again")}
            </button>
            <button onClick={onExit} className="btn btn-secondary">
              {t("exit")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {tiles.map((tile) => {
            const out = gone.has(tile.id);
            const state = bad.includes(tile.key)
              ? "border-red-400 bg-red-50 dark:bg-red-950/40"
              : pick?.key === tile.key
                ? "border-accent bg-accent/10"
                : "border-line bg-card hover:border-accent/60";
            return (
              <button
                key={tile.key}
                onClick={() => choose(tile)}
                disabled={out}
                className={`flex min-h-24 items-center justify-center rounded-2xl border-2 p-2 text-center text-sm transition-all duration-300 ${out ? "pointer-events-none scale-90 opacity-0" : state} ${tile.isTerm ? "font-serif text-base font-semibold" : ""}`}
              >
                {tile.text}
              </button>
            );
          })}
        </div>
      )}
      {!finished && (
        <div className="mt-3 text-right">
          <button onClick={onExit} className="text-sm text-muted underline">
            {t("exit")}
          </button>
        </div>
      )}
    </div>
  );
}
