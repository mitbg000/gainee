/** Appearance chosen in Settings → Appearance: colours, fonts, text size. Kept in a cookie so the server renders it with no flash. */
export const LOOK_COOKIE = "rl_look";
export const LOOK = {
  palette: ["navy", "teal", "green", "purple", "rose", "graphite"],
  tone: ["warm", "cool", "sepia"],
  ui: ["system", "rounded", "serif"],
  read: ["charter", "georgia", "palatino", "sans"],
  size: ["90", "100", "110", "120"],
} as const;
export type Look = { [K in keyof typeof LOOK]: (typeof LOOK)[K][number] };
export const DEFAULT_LOOK: Look = { palette: "navy", tone: "warm", ui: "system", read: "charter", size: "100" };

/** Cookie value ("palette=teal&tone=sepia…") → a valid Look; unknown values fall back to the default. */
export function parseLook(raw: string | undefined): Look {
  const q = new URLSearchParams(raw ?? "");
  const pick = <K extends keyof Look>(k: K): Look[K] => {
    const v = q.get(k);
    return (LOOK[k] as readonly string[]).includes(v ?? "") ? (v as Look[K]) : DEFAULT_LOOK[k];
  };
  return { palette: pick("palette"), tone: pick("tone"), ui: pick("ui"), read: pick("read"), size: pick("size") };
}

/** Attributes for <html>; CSS in globals.css reads them. */
export const lookAttrs = (l: Look) => ({ "data-palette": l.palette, "data-tone": l.tone, "data-ui": l.ui, "data-read": l.read, style: { fontSize: `${l.size}%` } });
