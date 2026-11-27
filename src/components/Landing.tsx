import Link from "next/link";
import { getTranslations } from "next-intl/server";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { getCreditConfig } from "@/lib/credits";
import { getTheme } from "@/theme/server";
import * as I from "@/components/icons";

const FEATURES = [
  { key: "read", icon: I.IconBook },
  { key: "words", icon: I.IconCards },
  { key: "ielts", icon: I.IconClipboard },
  { key: "listen", icon: I.IconHeadphones },
  { key: "write", icon: I.IconPen },
  { key: "progress", icon: I.IconChart },
] as const;

/** What visitors see at "/" before logging in. */
export default async function Landing() {
  const t = await getTranslations("landing");
  const ta = await getTranslations("app");
  const cfg = await getCreditConfig().catch(() => null);
  const signup = cfg?.allowSignup ?? false;
  const cta = signup ? { href: "/register", label: t("ctaSignup") } : { href: "/login", label: t("ctaLogin") };

  return (
    <div className="min-h-dvh bg-paper" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
          <Link href="/" className="mr-auto font-serif text-2xl font-bold">
            {ta("name")}
          </Link>
          <div className="hidden items-center gap-2 sm:flex">
            <LanguageSwitcher />
            <ThemeSwitcher initial={await getTheme()} />
          </div>
          <Link href="/login" className="btn btn-sm btn-ghost">
            {t("login")}
          </Link>
          {signup && (
            <Link href="/register" className="btn btn-sm btn-primary">
              {t("signup")}
            </Link>
          )}
        </div>
      </header>

      <main>
        {/* hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:px-6 md:py-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent2">{t("kicker")}</p>
            <h1 className="mt-3 font-serif text-4xl font-bold leading-tight text-balance md:text-5xl">{t("title")}</h1>
            <p className="mt-4 max-w-xl text-lg text-muted">{t("lead")}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={cta.href} className="btn btn-primary">
                {cta.label} <I.IconArrowRight className="h-4 w-4" />
              </Link>
              <a href="#features" className="btn btn-secondary">
                {t("more")}
              </a>
            </div>
            {signup && cfg && cfg.signupBonus > 0 && <p className="mt-4 text-sm text-muted">🎁 {t("bonus", { n: cfg.signupBonus })}</p>}
          </div>

          {/* a small picture of the reader: a sentence with a looked-up word and its card */}
          <div aria-hidden className="relative">
            <div className="rounded-3xl border border-line bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("demo.source")}</p>
              <p className="mt-3 font-serif text-[17px] leading-relaxed">
                {t("demo.before")} <mark className="rounded bg-highlight px-0.5 text-ink">{t("demo.word")}</mark> {t("demo.after")}
              </p>
              <div className="mt-5 rounded-2xl border border-line bg-paper p-4">
                <p className="font-serif text-xl font-bold">
                  {t("demo.word")} <span className="text-sm font-normal text-muted">/ˌʌn.prɪˈsed.ən.tɪd/ · adj.</span>
                </p>
                <p className="mt-1 text-accent">{t("demo.meaning")}</p>
                <div className="mt-3 flex gap-2 text-xs">
                  <span className="chip chip-on">{t("demo.saved")}</span>
                  <span className="chip">{t("demo.review")}</span>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-3 hidden rounded-2xl border border-line bg-card px-4 py-3 text-sm shadow-sm sm:block">
              <span className="font-semibold text-orange-600 dark:text-orange-400">
                <I.IconFlame className="inline-block h-4 w-4 align-[-0.2em]" /> 12
              </span>{" "}
              <span className="text-muted">{t("demo.streak")}</span>
            </div>
            <div className="absolute -right-3 -top-4 hidden rounded-2xl border border-line bg-card px-4 py-3 text-sm shadow-sm sm:block">
              <span className="text-muted">IELTS Reading</span> <span className="font-bold text-accent">7.0</span>
            </div>
          </div>
        </section>

        {/* features */}
        <section id="features" className="border-y border-line bg-card">
          <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
            <h2 className="font-serif text-3xl font-bold">{t("featuresTitle")}</h2>
            <p className="mt-2 max-w-2xl text-muted">{t("featuresLead")}</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ key, icon: Icon }) => (
                <li key={key} className="rounded-2xl border border-line bg-paper p-5">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="mt-3 font-semibold">{t(`f.${key}.title`)}</p>
                  <p className="mt-1 text-sm text-muted">{t(`f.${key}.text`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* how it works */}
        <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
          <h2 className="font-serif text-3xl font-bold">{t("stepsTitle")}</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-on-accent">{n}</span>
                <div>
                  <p className="font-semibold">{t(`step${n}.title`)}</p>
                  <p className="mt-1 text-sm text-muted">{t(`step${n}.text`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* last call */}
        <section className="mx-auto max-w-6xl px-4 pb-16 md:px-6">
          <div className="flex flex-col items-start gap-4 rounded-3xl bg-accent p-8 text-on-accent md:flex-row md:items-center md:p-10">
            <div className="flex-1">
              <p className="font-serif text-2xl font-bold md:text-3xl">{t("endTitle")}</p>
              <p className="mt-1 opacity-85">{t("endText")}</p>
            </div>
            <Link href={cta.href} className="btn bg-on-accent text-accent hover:opacity-90">
              {cta.label}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-6 text-sm text-muted md:px-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}>
          <span className="font-serif font-bold text-ink">{ta("name")}</span>
          <span>© {new Date().getFullYear()}</span>
          <span className="ml-auto flex items-center gap-2 sm:hidden">
            <LanguageSwitcher />
            <ThemeSwitcher initial={await getTheme()} />
          </span>
        </div>
      </footer>
    </div>
  );
}
