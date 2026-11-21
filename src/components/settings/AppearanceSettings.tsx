"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { DEFAULT_LOOK, LOOK, LOOK_COOKIE, lookAttrs, type Look } from "@/theme/look";
import type { Theme } from "@/theme/config";

/** Swatches: [accent, accent2, paper] shown on the choice buttons (light-mode values from globals.css). */
const PALETTE_SWATCH: Record<Look["palette"], string[]> = {
  navy: ["#1f4e79", "#c2410c"],
  teal: ["#0f6b6b", "#b45309"],
  green: ["#2f6b3a", "#a16207"],
  purple: ["#5b3f9e", "#be185d"],
  rose: ["#9f1239", "#1d4ed8"],
  graphite: ["#374151", "#b45309"],
};
const TONE_SWATCH: Record<Look["tone"], [string, string]> = { warm: ["#faf7f1", "#13161c"], cool: ["#f5f6f8", "#101317"], sepia: ["#f3ead6", "#1b1712"] };
const FONT: Record<Look["ui"] | Look["read"], string> = {
  system: "var(--f-system)",
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui',
  serif: "var(--f-charter)",
  charter: "var(--f-charter)",
  georgia: "Georgia, serif",
  palatino: '"Palatino Linotype", Palatino, "Book Antiqua", serif',
  sans: "var(--f-system)",
};

/** Colours, fonts and text size; applied at once on this device and remembered in a cookie. */
export default function AppearanceSettings({ initial, theme }: { initial: Look; theme: Theme }) {
  const t = useTranslations("settings.look");
  const [look, setLook] = useState(initial);

  const set = <K extends keyof Look>(k: K, v: Look[K]) => apply({ ...look, [k]: v });
  function apply(next: Look) {
    setLook(next);
    const { style, ...attrs } = lookAttrs(next);
    const html = document.documentElement;
    for (const [a, val] of Object.entries(attrs)) html.setAttribute(a, val);
    html.style.fontSize = style.fontSize;
    document.cookie = `${LOOK_COOKIE}=${new URLSearchParams(next).toString()}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
  }

  const choice = (on: boolean) => `flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${on ? "border-accent bg-accent/10 font-medium" : "border-line bg-card hover:border-accent/50"}`;

  return (
    <section>
      <div className="divide-y divide-line rounded-2xl border border-line bg-card">
        <Row label={t("mode")}>
          <ThemeSwitcher initial={theme} />
        </Row>

        <Row label={t("palette")} hint={t("paletteHint")}>
          {LOOK.palette.map((p) => (
            <button key={p} onClick={() => set("palette", p)} aria-pressed={look.palette === p} className={choice(look.palette === p)}>
              <span className="flex">
                {PALETTE_SWATCH[p].map((c, i) => (
                  <span key={i} className={`size-4 rounded-full border-2 border-card ${i ? "-ml-1.5" : ""}`} style={{ background: c }} />
                ))}
              </span>
              {t(`palettes.${p}`)}
            </button>
          ))}
        </Row>

        <Row label={t("tone")} hint={t("toneHint")}>
          {LOOK.tone.map((x) => (
            <button key={x} onClick={() => set("tone", x)} aria-pressed={look.tone === x} className={choice(look.tone === x)}>
              <span className="flex overflow-hidden rounded-md border border-line">
                <span className="h-4 w-3" style={{ background: TONE_SWATCH[x][0] }} />
                <span className="h-4 w-3" style={{ background: TONE_SWATCH[x][1] }} />
              </span>
              {t(`tones.${x}`)}
            </button>
          ))}
        </Row>

        <Row label={t("uiFont")} hint={t("uiFontHint")}>
          {LOOK.ui.map((f) => (
            <button key={f} onClick={() => set("ui", f)} aria-pressed={look.ui === f} className={choice(look.ui === f)} style={{ fontFamily: FONT[f] }}>
              {t(`fonts.${f}`)}
            </button>
          ))}
        </Row>

        <Row label={t("readFont")} hint={t("readFontHint")}>
          {LOOK.read.map((f) => (
            <button key={f} onClick={() => set("read", f)} aria-pressed={look.read === f} className={choice(look.read === f)} style={{ fontFamily: FONT[f] }}>
              {t(`fonts.${f}`)}
            </button>
          ))}
        </Row>

        <Row label={t("size")} hint={t("sizeHint")}>
          {LOOK.size.map((s) => (
            <button key={s} onClick={() => set("size", s)} aria-pressed={look.size === s} className={choice(look.size === s)}>
              <span style={{ fontSize: `${Number(s) * 0.15}px` }} className="font-semibold leading-none">
                A
              </span>
              {s}%
            </button>
          ))}
        </Row>

        {/* live sample in the chosen reading font */}
        <div className="p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent2">{t("preview")}</p>
          <p className="font-serif text-lg leading-relaxed">{t("sample")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="btn btn-primary">{t("sampleButton")}</span>
            <span className="chip chip-on">{t("sampleChip")}</span>
            <span className="rounded bg-highlight px-1">{t("sampleHighlight")}</span>
          </div>
        </div>
      </div>
      <button onClick={() => apply(DEFAULT_LOOK)} className="btn btn-ghost mt-3">
        {t("reset")}
      </button>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 p-4 md:grid-cols-[1fr_2fr] md:items-center">
      <div>
        <div className="font-medium">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
