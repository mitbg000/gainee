export const locales = ["en", "vi"] as const;
export type Locale = (typeof locales)[number];
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const defaultLocale: Locale = (locales as readonly string[]).includes(process.env.DEFAULT_LOCALE ?? "")
  ? (process.env.DEFAULT_LOCALE as Locale)
  : "en";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (locales as readonly string[]).includes(v);
}
