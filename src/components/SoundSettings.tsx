"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { DEFAULT_SOUND, onSoundPrefs, setSoundPrefs, sfx, soundPrefs, type SoundPrefs } from "@/lib/sound";
import { speak } from "@/lib/speech";
import * as I from "./icons";

/** Current sound settings, kept in step across every component on the page. */
export function useSoundPrefs() {
  const [p, setP] = useState<SoundPrefs>(DEFAULT_SOUND);
  useEffect(() => {
    setP(soundPrefs());
    return onSoundPrefs(setP);
  }, []);
  return [p, (patch: Partial<SoundPrefs>) => setP(setSoundPrefs(patch))] as const;
}

function Switch({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-3 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 flex-none rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

/** Sound on/off, study effects, reading words aloud automatically (+ a test). Used in the user menu and Settings. */
export default function SoundSettings({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("sound");
  const [p, set] = useSoundPrefs();
  return (
    <div className="space-y-3">
      <Switch on={!p.muted} onChange={(v) => set({ muted: !v })} label={t("all")} hint={compact ? undefined : t("allHint")} />
      <Switch on={p.effects} onChange={(v) => set({ effects: v })} label={t("effects")} hint={compact ? undefined : t("effectsHint")} disabled={p.muted} />
      <Switch on={p.autoSpeak} onChange={(v) => set({ autoSpeak: v })} label={t("autoSpeak")} hint={compact ? undefined : t("autoSpeakHint")} disabled={p.muted} />
      {!compact && (
        <button
          type="button"
          onClick={() => {
            sfx("correct");
            setTimeout(() => !soundPrefs().muted && speak("Hello"), 400);
          }}
          className="btn btn-sm btn-secondary"
        >
          <I.IconVolume /> {t("test")}
        </button>
      )}
    </div>
  );
}

/** One-click mute in the top bar. */
export function MuteButton() {
  const t = useTranslations("sound");
  const [p, set] = useSoundPrefs();
  return (
    <button onClick={() => set({ muted: !p.muted })} className="icon-btn" aria-pressed={p.muted} aria-label={p.muted ? t("unmute") : t("mute")} title={p.muted ? t("unmute") : t("mute")}>
      {p.muted ? <I.IconVolumeOff /> : <I.IconVolume />}
    </button>
  );
}
