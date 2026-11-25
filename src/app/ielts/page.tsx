import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import AttemptList from "@/components/ielts/AttemptList";
import { listBooks, mistakes, recentAttempts } from "@/lib/ielts/queries";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

/** IELTS hub: uploaded books → tests → mock tests (like the computer exam), practice per part and short lessons per question group. */
export default async function IeltsPage() {
  const t = await getTranslations("ielts");
  const [books, attempts, wrong] = await Promise.all([listBooks(), recentAttempts(12), mistakes()]);
  const tests = new Map(books.flatMap((b) => b.tests.map((x) => [x.id, `${b.title} · ${x.title}`] as const)));
  const sections = new Map(books.flatMap((b) => b.tests.flatMap((x) => x.sections.map((s) => [s.id, `${t(`skill.${s.skill}`)} ${s.part}`] as const))));
  const ready = books.filter((b) => b.tests.length);

  return (
    <Shell wide>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("intro")}</p>
        </div>
        <Link href="/ielts/review" className="btn btn-secondary">
          <I.IconTarget /> {t("mistakes", { n: wrong.wrong.length })}
        </Link>
        <Link href="/ielts/import" className="btn btn-primary">
          <I.IconUpload /> {t("upload")}
        </Link>
      </div>

      {!books.length && (
        <div className="mt-8 rounded-3xl border border-dashed border-line bg-card p-10 text-center">
          <I.BigIcon icon={I.IconClipboard} />
          <p className="mt-3 font-semibold">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted">{t("emptyHint")}</p>
          <Link href="/ielts/import" className="btn btn-primary mt-4">
            <I.IconUpload /> {t("upload")}
          </Link>
        </div>
      )}

      {books
        .filter((b) => !b.tests.length)
        .map((b) => (
          <Link key={b.id} href={`/ielts/books/${b.id}`} className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-card p-4 hover:border-accent/40">
            <I.IconBook className="h-5 w-5 text-muted" />
            <span className="flex-1 font-semibold">{b.title}</span>
            <span className="text-sm text-muted">{t(`status.${b.status}`)}</span>
          </Link>
        ))}

      {ready.map((b) => {
        const secs = b.tests.flatMap((x) => x.sections);
        const reviewed = secs.filter((s) => s.reviewed).length;
        return (
          <section key={b.id} className="mt-8">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-2xl font-bold">{b.title}</h2>
              <span className={`chip ${reviewed < secs.length ? "" : "chip-on"}`}>{t("reviewed", { n: reviewed, total: secs.length })}</span>
              {b.status === "parsing" && <span className="chip">{t("status.parsing")}</span>}
              <Link href={`/ielts/books/${b.id}`} className="btn btn-sm btn-ghost ml-auto">
                <I.IconEdit /> {t("manage")}
              </Link>
            </div>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {b.tests.map((test, ti) => (
                <div key={test.id} className="rounded-2xl border border-line bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="flex-1 text-lg font-bold">{test.title}</h3>
                    <Link href={`/ielts/mock/${test.id}`} className="btn btn-sm btn-primary">
                      <I.IconClock /> {t("mockFull")}
                    </Link>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(["listening", "reading", "writing"] as const)
                      .filter((sk) => test.sections.some((s) => s.skill === sk))
                      .map((sk) => (
                        <Link key={sk} href={`/ielts/mock/${test.id}?skill=${sk}`} className="chip">
                          {sk === "listening" ? <I.IconHeadphones className="h-3.5 w-3.5" /> : sk === "reading" ? <I.IconBook className="h-3.5 w-3.5" /> : <I.IconPen className="h-3.5 w-3.5" />}
                          {t("mockSkill", { skill: t(`skill.${sk}`) })}
                        </Link>
                      ))}
                  </div>
                  <details className="mt-3 group" open={ti === 0}>
                    <summary className="cursor-pointer text-sm font-semibold text-muted">{t("practiceList")}</summary>
                    <ul className="mt-2 space-y-2">
                      {test.sections.map((s) => (
                        <li key={s.id} className="rounded-xl bg-paper p-2.5">
                          <div className="flex items-center gap-2 text-sm">
                            {s.skill === "listening" ? <I.IconHeadphones className="h-4 w-4 flex-none" /> : s.skill === "reading" ? <I.IconBook className="h-4 w-4 flex-none" /> : <I.IconPen className="h-4 w-4 flex-none" />}
                            <span className="min-w-0 flex-1 truncate font-semibold">
                              {t(`part.${s.skill}`, { n: s.part })}
                              {s.title && <span className="font-normal text-muted"> · {s.title}</span>}
                            </span>
                            {s.skill !== "writing" && (
                              <Link href={`/ielts/practice/${s.id}`} className="btn btn-sm btn-secondary">
                                <I.IconTarget /> {t("practicePart")}
                              </Link>
                            )}
                            <Link href={`/ielts/mock/${test.id}?part=${s.id}`} className="btn btn-sm btn-outline">
                              <I.IconClock /> {t("mockPart")}
                            </Link>
                          </div>
                          {s.groups.length > 1 && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <span className="text-xs text-muted">{t("shortLessons")}</span>
                              {s.groups.map((g, gi) => (
                                <Link key={gi} href={`/ielts/practice/${s.id}?g=${gi}`} className="rounded-md border border-line bg-card px-2 py-0.5 text-xs hover:border-accent/50">
                                  {g.from}–{g.to} {t(`types.${g.type}`)}
                                </Link>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {attempts.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 font-serif text-2xl font-bold">{t("history")}</h2>
            <Link href="/ielts/history" className="btn btn-sm btn-ghost">
              {t("historyPage.all")} <I.IconChevronRight />
            </Link>
          </div>
          <div className="mt-3">
            <AttemptList rows={attempts} tests={tests} sections={sections} />
          </div>
        </section>
      )}
    </Shell>
  );
}
