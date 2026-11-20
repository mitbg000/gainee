export const themes = ["light", "dark", "system"] as const;
export type Theme = (typeof themes)[number];
export const THEME_COOKIE = "rl_theme";

export function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (themes as readonly string[]).includes(v);
}

/**
 * Runs in <head> before first paint so there is no flash of the wrong theme.
 * Kept as a string because it is inlined into the HTML.
 */
export const themeInitScript = `(()=>{try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);var t=m?m[1]:'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
