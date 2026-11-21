import { cookies } from "next/headers";
import { isTheme, THEME_COOKIE, type Theme } from "./config";
import { LOOK_COOKIE, parseLook } from "./look";

export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : "system";
}

export async function getLook() {
  return parseLook((await cookies()).get(LOOK_COOKIE)?.value);
}
