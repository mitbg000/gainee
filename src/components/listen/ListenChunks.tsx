"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import * as I from "@/components/icons";
import type { PlayItem } from "@/lib/listen/queries";
import { toChunks } from "@/lib/listen/segment";
import { LookupText, useLookup } from "./Lookup";
import { useClipPlayer } from "./useClipPlayer";

const SPEEDS = [0.75, 1, 1.25];

/**
 * Listen only: the recording in pieces of 20–40 s. Each piece stops by itself; the words stay hidden until asked
 * for, then every sentence can be played again on its own and its words looked up.
 */
export default function ListenChunks({ items, title, saved, sourceId }: { items: PlayItem[]; title: string; saved: { id: number; term: string }[]; sourceId: number }) {
  const t = useTranslations("listen.chunks");
  const player = useClipPlayer();
  const look = useLookup(saved);
  const chunks = useMemo(() => toChunks(items), [items]);
  const [k, setK] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [shown, setShown] = useState(false);
  const listened = useRef(0);
  const chunk = chunks[k] ?? [];
  const isVideo = items[0]?.media.kind === "youtube";

  const playAll = () => {
    if (!chunk.length) return;
    player.play({ media: chunk[0].media, start: chunk[0].start, end: chunk[chunk.length - 1].end }, speed);
    listened.current += (chunk[chunk.length - 1].end - chunk[0].start) / speed;
    if (listened.current >= 60) {
      const minutes = Math.floor(listened.current / 60);
      listened.current -= minutes * 60;
      fetch("/api/listen/time", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ minutes: Math.min(30, minutes) }) });
    }
  };

  useEffect(() => {
    if (isVideo && items[0].media.kind === "youtube") player.cueVideo(items[0].media.youtubeId, items[0].start);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once: show the video before the first play
  }, []);

  const go = (n: number) => {
    player.stop();
    setK(Math.max(0, Math.min(chunks.length - 1, n)));
    setShown(false);
  };

  if (!chunks.length) return <p className="text-muted">{t("empty")}</p>;
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-3 lg:sticky lg:top-20">
        <div ref={player.videoBox} className={`aspect-video w-full overflow-hidden rounded-2xl bg-black ${isVideo ? "" : "hidden"}`} />
        {!isVideo && (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 text-sm">
            <I.IconHeadphones className="h-6 w-6 text-accent" /> <span className="truncate">{title}</span>
          </div>
        )}
        {look.panel(sourceId)}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="font-mono tabular-nums">
            {t("piece", { n: k + 1, total: chunks.length })}
          </span>
          <span>
            {clock(chunk[0].start)}–{clock(chunk[chunk.length - 1].end)}
          </span>
        </div>
        <div className="rounded-2xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => go(k - 1)} disabled={k === 0} className="btn btn-secondary" aria-label={t("prev")}>
              <I.IconArrowLeft />
            </button>
            <button onClick={player.playing ? player.stop : playAll} className="btn btn-primary">
              {player.playing ? <I.IconStop /> : <I.IconPlay />} {player.playing ? t("stop") : t("play")}
            </button>
            <button onClick={() => go(k + 1)} disabled={k >= chunks.length - 1} className="btn btn-secondary" aria-label={t("next")}>
              <I.IconArrowRight />
            </button>
            <span role="group" className="inline-flex overflow-hidden rounded-lg border border-line">
              {SPEEDS.map((s) => (
                <button key={s} onClick={() => setSpeed(s)} aria-pressed={speed === s} className={`min-h-9 px-2.5 text-sm ${speed === s ? "bg-accent/15 font-semibold" : "text-muted hover:bg-paper"}`}>
                  {s}×
                </button>
              ))}
            </span>
            <button onClick={() => setShown(!shown)} className="btn btn-sm btn-ghost ml-auto">
              {shown ? <I.IconEyeOff /> : <I.IconEye />} {shown ? t("hide") : t("show")}
            </button>
          </div>
          {shown ? (
            <ul className="mt-3 space-y-2">
              {chunk.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <button onClick={() => player.play({ media: c.media, start: c.start, end: c.end }, speed)} className="icon-btn icon-btn-outline mt-1 flex-none" aria-label={t("playSentence")}>
                    <I.IconPlay className="h-3.5 w-3.5" />
                  </button>
                  <div className="min-w-0">
                    {c.speaker && <span className="text-xs font-semibold uppercase text-muted">{c.speaker} </span>}
                    <LookupText text={c.text} onLookup={look.setTool} className="font-serif text-lg leading-relaxed" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">{t("hiddenHint")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
