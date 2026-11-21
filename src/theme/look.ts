/**
 * Appearance chosen in Settings → Appearance (reading themes in the style of Kindle and Apple Books).
 * Kept in a cookie so the server renders it with no flash. The colours below are the only source:
 * lookCss() turns them into CSS, and the settings page uses them for its previews.
 */
export const LOOK_COOKIE = "rl_look";

type Tokens = { paper: string; card: string; ink: string; muted: string; line: string; highlight: string };
/** Page themes used in light mode. "paper" is the original Gainee look. */
export const LIGHT: Record<string, Tokens> = {
  paper: { paper: "#faf7f1", card: "#ffffff", ink: "#1d2433", muted: "#6b7280", line: "#e7e1d6", highlight: "#fff1c2" },
  original: { paper: "#f5f5f7", card: "#ffffff", ink: "#1d1d1f", muted: "#6e6e73", line: "#e2e2e7", highlight: "#fff3a8" },
  sepia: { paper: "#f3e9d2", card: "#faf3e3", ink: "#4b3a26", muted: "#86715a", line: "#e2d3b4", highlight: "#f2d98a" },
  mint: { paper: "#e4efdf", card: "#f1f7ee", ink: "#25352a", muted: "#5d7162", line: "#cfdec8", highlight: "#f4e79c" },
};
/** Page themes used in dark mode. "dusk" is the original Gainee dark look. */
export const DARK: Record<string, Tokens> = {
  dusk: { paper: "#13161c", card: "#1b1f27", ink: "#e6e8ec", muted: "#9aa3b2", line: "#2b313c", highlight: "#5b4a14" },
  quiet: { paper: "#1c1c1e", card: "#2c2c2e", ink: "#ececf1", muted: "#9a9aa1", line: "#3a3a3c", highlight: "#5e4b17" },
  night: { paper: "#000000", card: "#111111", ink: "#d4d4d4", muted: "#878787", line: "#242424", highlight: "#4d3f10" },
  cocoa: { paper: "#1d1914", card: "#27211b", ink: "#eadfca", muted: "#a7977f", line: "#3b3329", highlight: "#5c4714" },
};
/** Accent (buttons, links, active items) + accent2 (labels), for light and dark. */
export const ACCENTS: Record<string, { light: [string, string]; dark: [string, string] }> = {
  blue: { light: ["#1f4e79", "#c2410c"], dark: ["#7cb3e6", "#f59e5b"] },
  orange: { light: ["#c45500", "#1f4e79"], dark: ["#f0a24b", "#7cb3e6"] },
  teal: { light: ["#0f6b6b", "#b45309"], dark: ["#5fc4c0", "#f2a65a"] },
  green: { light: ["#2f6b3a", "#a16207"], dark: ["#7cc98a", "#e5b65a"] },
  purple: { light: ["#5b3f9e", "#be185d"], dark: ["#b39cf0", "#f084b4"] },
  rose: { light: ["#9f1239", "#1d4ed8"], dark: ["#f38ba8", "#8ab4f8"] },
  graphite: { light: ["#374151", "#b45309"], dark: ["#cbd5e1", "#f59e5b"] },
};
/** Font stacks; the --ff-* variables come from next/font (src/theme/fonts.ts), the rest are fonts already on the device. */
export const FONTS: Record<string, { name: string; css: string }> = {
  system: { name: "System", css: "var(--f-system)" },
  charter: { name: "Charter", css: "var(--f-charter)" },
  literata: { name: "Literata", css: "var(--ff-literata), Georgia, serif" },
  bitter: { name: "Bitter", css: "var(--ff-bitter), Georgia, serif" },
  merriweather: { name: "Merriweather", css: "var(--ff-merriweather), Georgia, serif" },
  lora: { name: "Lora", css: "var(--ff-lora), Georgia, serif" },
  sourceserif: { name: "Source Serif", css: "var(--ff-sourceserif), Georgia, serif" },
  notoserif: { name: "Noto Serif", css: "var(--ff-notoserif), Georgia, serif" },
  garamond: { name: "EB Garamond", css: "var(--ff-garamond), Garamond, serif" },
  georgia: { name: "Georgia", css: 'Georgia, "Times New Roman", serif' },
  palatino: { name: "Palatino", css: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
  inter: { name: "Inter", css: "var(--ff-inter), var(--f-system)" },
  bevietnam: { name: "Be Vietnam Pro", css: "var(--ff-bevietnam), var(--f-system)" },
  jakarta: { name: "Plus Jakarta Sans", css: "var(--ff-jakarta), var(--f-system)" },
  nunito: { name: "Nunito", css: "var(--ff-nunito), var(--f-system)" },
};

export const LOOK = {
  light: Object.keys(LIGHT),
  dark: Object.keys(DARK),
  accent: Object.keys(ACCENTS),
  side: ["match", "tint", "bold"],
  ui: ["system", "inter", "bevietnam", "jakarta", "nunito", "charter"],
  read: ["charter", "literata", "bitter", "merriweather", "lora", "sourceserif", "notoserif", "garamond", "georgia", "palatino", "inter", "bevietnam", "nunito"],
  size: ["90", "100", "110", "120"],
} as const;
export type Look = Record<keyof typeof LOOK, string>;
export const DEFAULT_LOOK: Look = { light: "paper", dark: "dusk", accent: "blue", side: "match", ui: "system", read: "charter", size: "100" };

/** Cookie value ("light=sepia&accent=teal…") → a valid Look; unknown values fall back to the default. */
export function parseLook(raw: string | undefined): Look {
  const q = new URLSearchParams(raw ?? "");
  const out = { ...DEFAULT_LOOK };
  for (const k of Object.keys(LOOK) as (keyof Look)[]) {
    const v = q.get(k);
    if (v && (LOOK[k] as readonly string[]).includes(v)) out[k] = v;
  }
  return out;
}

/** Attributes for <html>; the CSS from lookCss() and globals.css reads them. */
export const lookAttrs = (l: Look) => ({
  "data-light": l.light,
  "data-dark": l.dark,
  "data-accent": l.accent,
  "data-side": l.side,
  "data-ui": l.ui,
  "data-read": l.read,
  style: { fontSize: `${l.size}%` },
});

const vars = (t: Tokens) => Object.entries(t).map(([k, v]) => `--${k}:${v}`).join(";");
/** CSS for every theme, accent and font choice (inlined in <head> by the root layout). */
export function lookCss() {
  return [
    ...Object.entries(LIGHT).map(([k, t]) => `:root[data-light="${k}"]:not(.dark){${vars(t)}}`),
    ...Object.entries(DARK).map(([k, t]) => `:root.dark[data-dark="${k}"]{${vars(t)}}`),
    ...Object.entries(ACCENTS).flatMap(([k, a]) => [
      `:root[data-accent="${k}"]:not(.dark){--accent:${a.light[0]};--accent2:${a.light[1]}}`,
      `:root.dark[data-accent="${k}"]{--accent:${a.dark[0]};--accent2:${a.dark[1]}}`,
    ]),
    ...LOOK.ui.map((k) => `:root[data-ui="${k}"]{--ui-font:${FONTS[k].css}}`),
    ...LOOK.read.map((k) => `:root[data-read="${k}"]{--read-font:${FONTS[k].css}}`),
  ].join("\n");
}
