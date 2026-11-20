import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getTheme } from "@/theme/server";
import LanguageSwitcher from "./LanguageSwitcher";
import LogoutButton from "./LogoutButton";
import { MobileTabBar, SidebarNav } from "./NavLinks";
import ThemeSwitcher from "./ThemeSwitcher";

/**
 * App frame.
 *  - Desktop (md+): sticky sidebar with full navigation and settings at the bottom.
 *  - Mobile: compact top bar + bottom tab bar; respects iPhone safe areas (notch / home indicator).
 */
export default async function Shell({ children }: { children: React.ReactNode }) {
  const [t, theme] = await Promise.all([getTranslations(), getTheme()]);

  const controls = (
    <div className="flex items-center justify-between gap-3">
      <ThemeSwitcher initial={theme} />
      <LanguageSwitcher />
    </div>
  );

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-line bg-card p-4 md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:flex-none md:flex-col">
        <Link href="/" className="font-serif text-2xl font-bold">{t("app.name")}</Link>
        <p className="text-xs text-muted">{t("app.tagline")}</p>
        <SidebarNav />
        <div className="mt-auto flex flex-col gap-3 pt-6">
          {controls}
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-card/95 px-4 backdrop-blur md:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <Link href="/" className="flex h-12 items-center font-serif text-xl font-bold">{t("app.name")}</Link>
        <ThemeSwitcher initial={theme} />
      </header>

      <main
        className="min-w-0 flex-1 px-4 pt-5 md:px-10 md:py-8"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
      >
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>

      <MobileTabBar>
        <div className="flex flex-col gap-4">
          <LanguageSwitcher />
          <LogoutButton />
        </div>
      </MobileTabBar>
    </div>
  );
}
