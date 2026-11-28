import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import { InlineRename } from "@/components/ielts/BookTitle";
import BookFilter from "@/components/ielts/BookFilter";
import IeltsTabs from "@/components/ielts/IeltsTabs";
import { listBooks, mistakes } from "@/lib/ielts/queries";
import { isEditor } from "@/lib/users";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

/** IELTS hub: uploaded books → tests → mock tests (like the computer exam), practice per part and short lessons per question group. */
export default async function IeltsPage() {
  const t = await getTranslations("ielts");
  const [all, wrong, editor] = await Promise.all([listBooks(), mistakes(), isEditor()]);
  const books = editor ? all : all.filter((b) => b.tests.length); // learners see the books that are ready
  // newest book first ("Cambridge 19" before "Cambridge 2")
  const ready = books.filter((b) => b.tests.length).sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true }));

  return (
    <Shell wide>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
        </div>
        <Link href="/ielts/review" className="btn btn-secondary">
          <I.IconTarget /> {t("mistakes", { n: wrong.wrong.length })}
        </Link>
        {editor && (
          <Link href="/ielts/import" className="btn btn-primary">
            <I.IconUpload /> {t("upload")}
          </Link>
        )}
      </div>
      <IeltsTabs active="books" />

      {!books.length && (
        <div className="mt-8 rounded-3xl border border-dashed border-line bg-card p-10 text-center">
          <I.BigIcon icon={I.IconClipboard} />
          <p className="mt-3 font-semibold">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted">{t("emptyHint")}</p>
          {editor && (
            <Link href="/ielts/import" className="btn btn-primary mt-4">
              <I.IconUpload /> {t("upload")}
            </Link>
          )}
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

      {ready.length > 4 && <BookFilter placeholder={t("searchBooks")} />}

      {ready.map((b, i) => {
        const secs = b.tests.flatMap((x) => x.sections);
        const reviewed = secs.filter((s) => s.reviewed).length;
        return (
          <details key={b.id} data-book={b.title} open={i === 0} className="group mt-3 rounded-2xl border border-line bg-card first-of-type:mt-6">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 p-4 [&::-webkit-details-marker]:hidden">
              <I.IconChevronRight className="h-4 w-4 flex-none text-muted transition-transform group-open:rotate-90" />
              <h2 className="font-serif text-xl font-bold md:text-2xl">{b.title}</h2>
              <span className="text-sm text-muted">{t("testCount", { n: b.tests.length })}</span>
              {editor && <span className={`chip ${reviewed < secs.length ? "" : "chip-on"}`}>{t("reviewed", { n: reviewed, total: secs.length })}</span>}
              {b.status === "parsing" && <span className="chip">{t("status.parsing")}</span>}
              {editor && (
                <Link href={`/ielts/books/${b.id}`} className="btn btn-sm btn-ghost ml-auto">
                  <I.IconEdit /> {t("manage")}
                </Link>
              )}
            </summary>
            <div className="grid gap-3 px-4 pb-4 lg:grid-cols-2">
              {b.tests.map((test) => (
                <div key={test.id} className="rounded-xl bg-paper p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="flex min-w-0 flex-1 text-lg font-bold">
                      {editor ? <InlineRename url={`/api/ielts/tests/${test.id}`} title={test.title} /> : test.title}
                    </h3>
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
                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-sm font-semibold text-muted">{t("practiceList")}</summary>
                    <ul className="mt-2 space-y-2">
                      {test.sections.map((s) => (
                        <li key={s.id} className="rounded-xl bg-card p-2.5">
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
                                <Link key={gi} href={`/ielts/practice/${s.id}?g=${gi}`} className="rounded-md border border-line bg-paper px-2 py-0.5 text-xs hover:border-accent/50">
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
          </details>
        );
      })}

    </Shell>
  );
}
