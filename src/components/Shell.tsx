import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { sidebarTree } from "@/lib/documents/queries";
import { dueCount } from "@/lib/review";
import { streak } from "@/lib/stats";
import { currentUser, mayUse } from "@/lib/users";
import { getTheme } from "@/theme/server";
import ChatBubble from "./ChatBubble";
import CollapsibleSidebar from "./CollapsibleSidebar";
import InstallApp from "./InstallApp";
import LogoutButton from "./LogoutButton";
import { MobileTabBar, SidebarNav } from "./NavLinks";
import TopBar from "./TopBar";
import { IconGear } from "./icons";

/**
 * App frame.
 *  - Desktop (md+): sticky sidebar with full navigation, and a top bar (breadcrumbs, look-up, due reviews, theme, settings).
 *  - Mobile: compact top bar + bottom tab bar; respects iPhone safe areas (notch / home indicator).
 */
export default async function Shell({ children, wide = false, full = false }: { children: React.ReactNode; wide?: boolean; full?: boolean }) {
  const [t, tree, due, theme, days, me] = await Promise.all([getTranslations(), sidebarTree().catch(() => []), dueCount().catch(() => 0), getTheme(), streak().catch(() => 0), currentUser()]);
  if (!me) redirect("/login"); // account locked or session ended (password changed)
  const admin = me.role === "admin";
  const hidden = (await mayUse("add_documents")) ? [] : ["/import"];

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <CollapsibleSidebar>
        <Link href="/" className="font-serif text-2xl font-bold" title={t("app.name")}>
          <span className="group-data-[collapsed=true]/sb:hidden">{t("app.name")}</span>
          <span className="hidden text-center group-data-[collapsed=true]/sb:block">{t("app.name").charAt(0)}</span>
        </Link>
        <p className="text-xs text-muted group-data-[collapsed=true]/sb:hidden">{t("app.tagline")}</p>
        <SidebarNav tree={tree} admin={admin} hidden={hidden} />
      </CollapsibleSidebar>

      {/* Mobile top bar */}
      <header
        className="chrome sticky top-0 z-30 flex items-center justify-between border-b border-line bg-card/95 px-4 backdrop-blur md:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <Link href="/" className="flex h-12 items-center font-serif text-xl font-bold">{t("app.name")}</Link>
        <Link href="/settings" className="icon-btn" aria-label={t("nav.settings")} title={t("nav.settings")}>
          <IconGear />
        </Link>
      </header>

      <div className="min-w-0 flex-1 md:flex md:flex-col">
        <TopBar tree={tree} due={due} theme={theme} streak={days} credits={admin ? null : me.credits} />
        <main
          className={`min-w-0 flex-1 px-4 pt-5 md:py-8 ${full ? "md:px-5" : "md:px-10"}`}
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
        >
          <div className={full ? "" : `mx-auto ${wide ? "max-w-6xl" : "max-w-4xl"}`}>{children}</div>
        </main>
      </div>

      <ChatBubble docs={tree} />

      <MobileTabBar admin={admin} hidden={hidden}>
        <div className="flex flex-col gap-4">
          <InstallApp />
          <LogoutButton />
        </div>
      </MobileTabBar>
    </div>
  );
}
