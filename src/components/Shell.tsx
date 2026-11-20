import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { sidebarTree } from "@/lib/documents/queries";
import { getTheme } from "@/theme/server";
import CollapsibleSidebar from "./CollapsibleSidebar";
import LanguageSwitcher from "./LanguageSwitcher";
import LogoutButton from "./LogoutButton";
import { MobileTabBar, SidebarNav } from "./NavLinks";
import ThemeSwitcher from "./ThemeSwitcher";

/**
 * App frame.
 *  - Desktop (md+): sticky sidebar with full navigation and settings at the bottom.
 *  - Mobile: compact top bar + bottom tab bar; respects iPhone safe areas (notch / home indicator).
 */
export default async function Shell({ children, wide = false, full = false }: { children: React.ReactNode; wide?: boolean; full?: boolean }) {
  const [t, theme, tree] = await Promise.all([getTranslations(), getTheme(), sidebarTree().catch(() => [])]);

  const controls = (
    <div className="flex items-center justify-between gap-3">
      <ThemeSwitcher initial={theme} />
      <LanguageSwitcher />
    </div>
  );

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <CollapsibleSidebar>
        <Link href="/" className="font-serif text-2xl font-bold" title={t("app.name")}>
          <span className="group-data-[collapsed=true]/sb:hidden">{t("app.name")}</span>
          <span className="hidden text-center group-data-[collapsed=true]/sb:block">{t("app.name").charAt(0)}</span>
        </Link>
        <p className="text-xs text-muted group-data-[collapsed=true]/sb:hidden">{t("app.tagline")}</p>
        <SidebarNav tree={tree} />
        <div className="mt-auto flex flex-col gap-3 pt-4 group-data-[collapsed=true]/sb:hidden">
          {controls}
          <LogoutButton />
        </div>
      </CollapsibleSidebar>

      {/* Mobile top bar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-card/95 px-4 backdrop-blur md:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <Link href="/" className="flex h-12 items-center font-serif text-xl font-bold">{t("app.name")}</Link>
        <ThemeSwitcher initial={theme} />
      </header>

      <main
        className={`min-w-0 flex-1 px-4 pt-5 md:py-8 ${full ? "md:px-5" : "md:px-10"}`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
      >
        <div className={full ? "" : `mx-auto ${wide ? "max-w-6xl" : "max-w-4xl"}`}>{children}</div>
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
