"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { localAudio } from "@/lib/ielts/audioCache";
import type { Media } from "@/lib/listen/queries";

/* Minimal typing of YouTube's IFrame Player API (https://developers.google.com/youtube/iframe_api_reference). */
type YTPlayer = {
  seekTo(s: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  setPlaybackRate(r: number): void;
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  destroy(): void;
};
type YTNs = { Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayer };
declare global {
  interface Window {
    YT?: YTNs;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoading: Promise<YTNs> | null = null;
function youtubeApi(): Promise<YTNs> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiLoading ??= new Promise((ok) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      ok(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiLoading;
}

export type Clip = { media: Media; start: number; end: number };

/**
 * Plays one sentence (start → end) of a YouTube video or an IELTS recording and stops at its end. The YouTube player
 * stays visible in `videoBox`; audio files are played from a local copy so seeking is exact.
 */
export function useClipPlayer() {
  const videoBox = useRef<HTMLDivElement>(null);
  const yt = useRef<{ player: YTPlayer; videoId: string; ready: Promise<void> } | null>(null);
  const audio = useRef<{ el: HTMLAudioElement; url: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const stop = useCallback(() => {
    stopTimer();
    yt.current?.player.pauseVideo?.(); // the player has no methods until it is ready
    audio.current?.el.pause();
    setPlaying(false);
  }, []);

  /** Make the YouTube player show this video (without playing), e.g. before the first sentence. */
  const cueVideo = useCallback(async (videoId: string, at = 0) => {
    const YT = await youtubeApi();
    if (yt.current?.videoId === videoId) return yt.current;
    if (yt.current) {
      await yt.current.ready;
      yt.current.player.loadVideoById({ videoId, startSeconds: at });
      yt.current.videoId = videoId;
      return yt.current;
    }
    const box = videoBox.current;
    if (!box) return null;
    const mount = document.createElement("div");
    box.replaceChildren(mount);
    let done!: () => void;
    const ready = new Promise<void>((ok) => (done = ok));
    const player = new YT.Player(mount, {
      videoId,
      width: "100%",
      height: "100%",
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: Math.floor(at), cc_load_policy: 0, iv_load_policy: 3 },
      events: { onReady: () => done() },
    });
    yt.current = { player, videoId, ready };
    await ready;
    return yt.current;
  }, []);

  const play = useCallback(
    async (c: Clip, speed = 1) => {
      stop();
      const from = Math.max(0, c.start + c.media.shift);
      const to = c.end + c.media.shift;
      setFailed(false);
      let now: () => number;
      let pause: () => void;
      if (c.media.kind === "youtube") {
        const y = await cueVideo(c.media.youtubeId, from);
        if (!y) return;
        await y.ready;
        y.player.setPlaybackRate(speed);
        y.player.seekTo(from, true);
        y.player.playVideo();
        now = () => y.player.getCurrentTime();
        pause = () => y.player.pauseVideo();
      } else {
        if (audio.current?.url !== c.media.audioUrl) {
          setLoading(true);
          try {
            const src = await localAudio(c.media.audioUrl, () => {});
            audio.current?.el.pause();
            audio.current = { el: new Audio(src), url: c.media.audioUrl };
          } catch {
            setFailed(true);
            return;
          } finally {
            setLoading(false);
          }
        }
        const el = audio.current!.el;
        el.playbackRate = speed;
        el.currentTime = from;
        await el.play().catch(() => setFailed(true));
        now = () => el.currentTime;
        pause = () => el.pause();
      }
      setPlaying(true);
      // the reported time can still be the old one just after seeking: only stop once it is inside the sentence
      let inside = false;
      timer.current = setInterval(() => {
        const t = now();
        if (t >= from - 0.3 && t < to) inside = true;
        if (inside && t >= to) {
          pause();
          stopTimer();
          setPlaying(false);
        }
      }, 40);
    },
    [cueVideo, stop],
  );

  useEffect(
    () => () => {
      stopTimer();
      yt.current?.player.destroy?.();
      yt.current = null;
      audio.current?.el.pause();
    },
    [],
  );

  return { videoBox, play, stop, cueVideo, playing, loading, failed };
}
