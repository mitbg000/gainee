"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import SoundSettings from "@/components/SoundSettings";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { ACCENTS, DARK, DEFAULT_LOOK, FONTS, LIGHT, LOOK, LOOK_COOKIE, lookAttrs, type Look } from "@/theme/look";
import type { Theme } from "@/theme/config";

/** Reading themes, accent colour, sidebar style, fonts and text size – in the manner of Kindle / Apple Books. Applied at once and kept in a cookie (per device). */
export default function AppearanceSettings({ initial, theme }: { initial: Look; theme: Theme }) {
  const t = useTranslations("settings.look");
  const [look, setLook] = useState(initial);
  const cur = useRef(initial); // latest choice, so quick successive clicks never undo each other

  function apply(next: Look) {
    cur.current = next;
    setLook(next);
    const { style, ...attrs } = lookAttrs(next);
    const html = document.documentElement;
    for (const [a, v] of Object.entries(attrs)) html.setAttribute(a, v);
    html.style.fontSize = style.fontSize;
    document.cookie = `${LOOK_COOKIE}=${new URLSearchParams(next).toString()}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
  }
  const set = (k: keyof Look, v: string) => apply({ ...cur.current, [k]: v });
  const accent = ACCENTS[look.accent];

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <Section title={t("mode")}>
          <ThemeSwitcher initial={theme} full />
        </Section>
        <Section title={t("language")}>
          <LanguageSwitcher full />
        </Section>
      </div>

      <Section title={t("sound")}>
        <div className="max-w-md">
          <SoundSettings />
        </div>
      </Section>

      <Section title={t("lightThemes")} hint={t("themesHint")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LOOK.light.map((k) => (
            <ThemeCard key={k} tokens={LIGHT[k]} accent={accent.light[0]} name={t(`themes.${k}`)} on={look.light === k} onClick={() => set("light", k)} />
          ))}
        </div>
      </Section>

      <Section title={t("darkThemes")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LOOK.dark.map((k) => (
            <ThemeCard key={k} tokens={DARK[k]} accent={accent.dark[0]} name={t(`themes.${k}`)} on={look.dark === k} onClick={() => set("dark", k)} />
          ))}
        </div>
      </Section>

      <Section title={t("accent")} hint={t("accentHint")}>
        <div className="flex flex-wrap gap-3">
          {LOOK.accent.map((k) => (
            <button
              key={k}
              onClick={() => set("accent", k)}
              aria-pressed={look.accent === k}
              title={t(`accents.${k}`)}
              className={`flex flex-col items-center gap-1.5 rounded-xl p-1.5 text-xs ${look.accent === k ? "font-semibold text-ink" : "text-muted"}`}
            >
              <span
                className={`flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-paper ${look.accent === k ? "ring-2 ring-ink" : ""}`}
                style={{ background: `linear-gradient(135deg, ${ACCENTS[k].light[0]} 50%, ${ACCENTS[k].dark[0]} 50%)` }}
              />
              {t(`accents.${k}`)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("side")} hint={t("sideHint")}>
        <div className="grid grid-cols-3 gap-3 sm:max-w-lg">
          {LOOK.side.map((k) => {
            const p = LIGHT[look.light];
            const bar = k === "match" ? p.card : k === "tint" ? `color-mix(in srgb, ${accent.light[0]} 9%, ${p.paper})` : `color-mix(in srgb, ${accent.light[0]} 88%, #000)`;
            return (
              <button key={k} onClick={() => set("side", k)} aria-pressed={look.side === k} className="text-center text-sm">
                <span className={`flex h-20 overflow-hidden rounded-xl border-2 ${look.side === k ? "border-accent" : "border-line"}`} style={{ background: p.paper }}>
                  <span className="flex w-1/3 flex-col gap-1.5 border-r p-2" style={{ background: bar, borderColor: p.line }}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-1.5 rounded-full" style={{ background: k === "bold" ? "#ffffff" : i ? p.muted : accent.light[0], opacity: i ? 0.5 : 1 }} />
                    ))}
                  </span>
                  <span className="flex-1 p-2">
                    <span className="block h-2 w-3/4 rounded-full" style={{ background: p.ink, opacity: 0.7 }} />
                    <span className="mt-1.5 block h-1.5 w-full rounded-full" style={{ background: p.muted, opacity: 0.4 }} />
                    <span className="mt-1 block h-1.5 w-5/6 rounded-full" style={{ background: p.muted, opacity: 0.4 }} />
                  </span>
                </span>
                <span className={`mt-1.5 block ${look.side === k ? "font-semibold" : "text-muted"}`}>{t(`sides.${k}`)}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={t("readFont")} hint={t("readFontHint")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {LOOK.read.map((k) => (
            <button
              key={k}
              onClick={() => set("read", k)}
              aria-pressed={look.read === k}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${look.read === k ? "border-accent bg-accent/10" : "border-line bg-card hover:border-accent/50"}`}
            >
              <span className="block text-2xl leading-tight" style={{ fontFamily: FONTS[k].css }}>
                Aa Ăê
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {FONTS[k].name}
                {t.has(`fontTag.${k}`) && ` · ${t(`fontTag.${k}`)}`}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("uiFont")} hint={t("uiFontHint")}>
        <div className="flex flex-wrap gap-2">
          {LOOK.ui.map((k) => (
            <button key={k} onClick={() => set("ui", k)} aria-pressed={look.ui === k} className={`chip ${look.ui === k ? "chip-on" : ""}`} style={{ fontFamily: FONTS[k].css }}>
              {k === "system" ? t("system") : FONTS[k].name}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("size")} hint={t("sizeHint")}>
        <div className="inline-flex overflow-hidden rounded-xl border border-line bg-card">
          {LOOK.size.map((s, i) => (
            <button
              key={s}
              onClick={() => set("size", s)}
              aria-pressed={look.size === s}
              className={`flex min-h-11 min-w-16 items-end justify-center gap-1 px-3 pb-2.5 ${i ? "border-l border-line" : ""} ${look.size === s ? "bg-accent text-on-accent" : "hover:bg-paper"}`}
            >
              <span className="font-serif font-semibold leading-none" style={{ fontSize: `${10 + i * 4}px` }}>
                A
              </span>
              <span className="text-[11px] leading-none opacity-80">{s}%</span>
            </button>
          ))}
        </div>
      </Section>

      {/* live sample: what a reading page looks like with these choices */}
      <Section title={t("preview")}>
        <div className="rounded-2xl border border-line bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent2">{t("sampleKicker")}</p>
          <h3 className="mt-1 font-serif text-2xl font-bold">{t("sampleTitle")}</h3>
          <p className="mt-2 font-serif text-lg leading-relaxed">
            {t.rich("sample", { mark: (c) => <mark className="rounded bg-highlight px-0.5 text-ink">{c}</mark> })}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="btn btn-primary">{t("sampleButton")}</span>
            <span className="btn btn-secondary">{t("sampleSecondary")}</span>
            <span className="chip chip-on">{t("sampleChip")}</span>
          </div>
        </div>
      </Section>

      <button onClick={() => apply(DEFAULT_LOOK)} className="btn btn-ghost">
        {t("reset")}
      </button>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {hint && <p className="mb-1 text-sm text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A little page in the theme's colours, like the theme buttons of Apple Books. */
function ThemeCard({ tokens: p, accent, name, on, onClick }: { tokens: (typeof LIGHT)[string]; accent: string; name: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} className="text-left">
      <span
        className={`block rounded-2xl border-2 p-3 shadow-sm transition ${on ? "border-accent" : "border-transparent"}`}
        style={{ background: p.paper, outline: on ? "none" : `1px solid ${p.line}`, outlineOffset: -1 }}
      >
        <span className="block rounded-lg p-2.5" style={{ background: p.card, border: `1px solid ${p.line}` }}>
          <span className="block font-serif text-2xl font-semibold leading-none" style={{ color: p.ink }}>
            Aa
          </span>
          <span className="mt-2 block h-1.5 w-full rounded-full" style={{ background: p.muted, opacity: 0.45 }} />
          <span className="mt-1 block h-1.5 w-2/3 rounded-full" style={{ background: p.muted, opacity: 0.45 }} />
          <span className="mt-2 block h-2 w-10 rounded-full" style={{ background: accent }} />
        </span>
      </span>
      <span className={`mt-1.5 block text-center text-sm ${on ? "font-semibold" : "text-muted"}`}>{name}</span>
    </button>
  );
}
