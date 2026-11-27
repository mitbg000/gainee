import Link from "next/link";
import { getTranslations } from "next-intl/server";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { getTheme } from "@/theme/server";
import * as I from "@/components/icons";

/** Frame of the pages before logging in (login, sign-up, forgotten password): the app's promise on the left, the form on the right. */
export default async function AuthShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();
  const points = [
    { icon: I.IconBook, text: t("auth.point1") },
    { icon: I.IconCards, text: t("auth.point2") },
    { icon: I.IconHeadphones, text: t("auth.point3") },
  ];
  return (
    <main className="flex min-h-dvh flex-col bg-paper" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <header className="flex h-16 items-center px-4 md:px-8">
        <Link href="/" className="font-serif text-2xl font-bold">
          {t("app.name")}
        </Link>
        <div className="ml-auto flex items-center">
          <LanguageSwitcher variant="menu" />
          <ThemeSwitcher variant="menu" initial={await getTheme()} />
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 pb-10 pt-2">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-line bg-card shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <aside className="hidden flex-col justify-between bg-accent p-8 text-on-accent md:flex">
            <div>
              <p className="font-serif text-3xl font-bold leading-tight">{t("auth.headline")}</p>
              <p className="mt-3 text-sm opacity-85">{t("app.description")}</p>
            </div>
            <ul className="mt-8 space-y-4 text-sm">
              {points.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-on-accent/15">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="pt-1.5">{text}</span>
                </li>
              ))}
            </ul>
          </aside>
          <section className="p-6 sm:p-10">{children}</section>
        </div>
      </div>
    </main>
  );
}
