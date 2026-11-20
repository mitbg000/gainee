import { cookies } from "next/headers";
import { isTheme, THEME_COOKIE, type Theme } from "./config";

export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : "system";
}
