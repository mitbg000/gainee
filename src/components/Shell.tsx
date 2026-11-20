import Link from "next/link";
import { getTranslations } from "next-intl/server";
import LanguageSwitcher from "./LanguageSwitcher";
import LogoutButton from "./LogoutButton";

const NAV: { href: string; key: string; phase?: number }[] = [
  { href: "/", key: "dashboard" },
  { href: "/library", key: "library", phase: 1 },
  { href: "/import", key: "import", phase: 1 },
  { href: "/words", key: "words", phase: 2 },
  { href: "/review", key: "review", phase: 2 },
  { href: "/progress", key: "progress", phase: 2 },
  { href: "/assistant", key: "assistant", phase: 3 },
  { href: "/settings", key: "settings", phase: 3 },
];

export default async function Shell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-white p-4 md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-none md:flex-col md:border-r md:border-b-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link href="/" className="font-serif text-2xl font-bold">{t("app.name")}</Link>
            <p className="text-xs text-gray-500">{t("app.tagline")}</p>
          </div>
          <LanguageSwitcher className="md:hidden" />
        </div>
        <nav className="mt-5 flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map((n) => (
            <Link
              key={n.key}
              href={n.phase ? "#" : n.href}
              aria-disabled={!!n.phase}
              className={`flex items-center justify-between whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                n.phase ? "pointer-events-none text-gray-400" : "hover:bg-paper"
              }`}
            >
              {t(`nav.${n.key}`)}
              {n.phase && <span className="ml-2 rounded bg-gray-100 px-1.5 text-[10px]">{t("nav.phase", { n: n.phase })}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden items-center justify-between pt-6 md:flex">
          <LogoutButton />
          <LanguageSwitcher />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-7 md:px-10">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}
