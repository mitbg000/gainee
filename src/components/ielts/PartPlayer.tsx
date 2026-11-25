"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import * as I from "@/components/icons";

const SPEEDS = [0.75, 1, 1.25];
const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

/**
 * Player for one Listening part inside a whole-test recording: the time bar runs from the part's start (0:00)
 * to its end, and playing or seeking never leaves the part.
 */
export default function PartPlayer({ url, start, end }: { url: string; start: number | null; end: number | null }) {
  const t = useTranslations("ielts.practice");
  const a = useRef<HTMLAudioElement>(null);
  const [fileLen, setFileLen] = useState<number | null>(null);
  const [pos, setPos] = useState(0); // seconds from the part's start
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const from = start ?? 0;
  const to = end ?? fileLen ?? 0;
  const len = Math.max(0, to - from);

  useEffect(() => {
    if (a.current) a.current.playbackRate = speed;
  }, [speed]);

  const seek = (rel: number) => {
    const el = a.current;
    if (!el) return;
    const r = Math.min(Math.max(0, rel), Math.max(0, len - 0.2));
    el.currentTime = from + r;
    setPos(r);
  };
  const toggle = () => {
    const el = a.current;
    if (!el) return;
    if (!el.paused) return el.pause();
    if (pos >= len - 0.5) seek(0); // at the end: start the part again
    el.play().catch(() => {});
  };

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <audio
        ref={a}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          setFileLen(e.currentTarget.duration);
          e.currentTarget.currentTime = from;
          e.currentTarget.playbackRate = speed;
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.currentTime < from - 1) el.currentTime = from; // never before the part
          if (len && el.currentTime >= to) {
            el.pause();
            el.currentTime = to;
          }
          setPos(Math.min(len, Math.max(0, el.currentTime - from)));
        }}
      />
      <button onClick={toggle} disabled={!len} className="btn btn-primary size-10 !px-0" aria-label={playing ? t("pause") : t("play")}>
        {playing ? (
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
            <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
          </svg>
        ) : (
          <I.IconPlay />
        )}
      </button>
      <span className="w-24 flex-none text-center text-sm tabular-nums text-muted">
        {clock(pos)} / {clock(len)}
      </span>
      <input type="range" min={0} max={len || 1} step={0.1} value={pos} onChange={(e) => seek(Number(e.target.value))} disabled={!len} aria-label={t("position")} className="min-w-32 flex-1 accent-[var(--accent)]" />
      <div className="flex gap-1">
        <button onClick={() => (seek(0), a.current?.play().catch(() => {}))} className="chip" title={t("replayAll")}>
          <I.IconRefresh className="h-3.5 w-3.5" /> {t("replayAll")}
        </button>
        <button onClick={() => seek(pos - 5)} className="chip">
          −5s
        </button>
        <button onClick={() => seek(pos + 5)} className="chip">
          +5s
        </button>
      </div>
      <div className="flex gap-1">
        {SPEEDS.map((s) => (
          <button key={s} onClick={() => setSpeed(s)} className={`chip ${speed === s ? "chip-on" : ""}`}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
