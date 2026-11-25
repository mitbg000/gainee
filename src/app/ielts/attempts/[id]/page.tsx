import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import Questions from "@/components/ielts/Questions";
import WritingGrades from "@/components/ielts/WritingGrades";
import { getAttempt, setAttemptBand } from "@/lib/ielts/queries";
import Markdown from "@/components/lesson/Markdown";
import { overall } from "@/lib/ielts/score";
import { wordCount } from "@/lib/text/clean";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

/** Result of a mock test or practice round: bands, every answer marked, and Writing graded by AI. */
export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("ielts.result");
  const a = await getAttempt(Number((await params).id));
  if (!a) notFound();
  const answers = a.answers as Record<string, string>;
  const scores = a.detail.scores ?? {};
  const sections = a.test.sections.filter((s) => a.detail.marks?.[s.id]);
  const writing = a.detail.writing.map((w) => {
    const row = a.writings.find((x) => x.id === w.writingId);
    return { writingId: w.writingId, part: w.part, words: row ? wordCount(row.body) : 0, band: row?.bandOverall ?? null, feedback: ((row?.feedback as { feedback?: string } | null)?.feedback as string) ?? null };
  });
  const wBands = writing.map((w) => w.band);
  const wBand = writing.length === 2 && wBands.every((b) => b != null) ? Math.round(((wBands[writing.findIndex((w) => w.part === 1)]! + 2 * wBands[writing.findIndex((w) => w.part === 2)]!) / 3) * 2) / 2 : null;
  const all = a.skill === "full" && scores.listening && scores.reading && wBand != null ? overall([scores.listening.band, scores.reading.band, wBand]) : null;
  const mins = Math.round(a.seconds / 60);
  // once AI has graded the writing, keep the band on the try for the history list
  const finalBand = a.skill === "writing" ? wBand : a.skill === "full" ? all : null;
  if (finalBand != null && a.band !== finalBand) await setAttemptBand(a.id, finalBand);
  const flags = new Set(a.detail.flags ?? []);

  return (
    <Shell wide>
      <Link href="/ielts" className="text-sm text-muted hover:underline">
        ← {t("back")}
      </Link>
      <h1 className="mt-1 font-serif text-3xl font-bold">
        {t(`title.${a.mode}`)} · {a.test.book?.title} · {a.test.title}
      </h1>
      <p className="mt-1 text-sm text-muted">{t("meta", { mins, date: a.createdAt.toLocaleString("vi-VN") })}</p>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {(["listening", "reading"] as const)
          .filter((k) => scores[k])
          .map((k) => (
            <div key={k} className="rounded-2xl border border-line bg-card p-5">
              <p className="text-sm font-semibold capitalize text-muted">{k}</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-bold">{scores[k].band}</span>
                <span className="text-muted">
                  {scores[k].score}/{scores[k].total}
                </span>
              </p>
              {(a.mode === "practice" || a.sectionId) && <p className="mt-1 text-xs text-muted">{t("estimate")}</p>}
            </div>
          ))}
        {all != null && (
          <div className="rounded-2xl border-2 border-accent bg-card p-5">
            <p className="text-sm font-semibold text-muted">{t("overall")}</p>
            <p className="mt-1 text-4xl font-bold">{all}</p>
            <p className="mt-1 text-xs text-muted">{t("overallHint")}</p>
          </div>
        )}
      </div>

      {(a.skill === "writing" || a.skill === "full") && (
        <div className="mt-4">
          <WritingGrades items={writing} />
        </div>
      )}

      {sections.map((s) => {
        const marks = a.detail.marks[s.id];
        const values = Object.fromEntries(Object.entries(answers).filter(([k]) => k.startsWith(`${s.id}:`)));
        const right = Object.values(marks).filter(Boolean).length;
        return (
          <section key={s.id} className="mt-6 rounded-2xl border border-line bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="flex-1 text-lg font-bold capitalize">
                {s.skill} {s.part} {s.title && <span className="font-normal normal-case text-muted">· {s.title}</span>}
              </h2>
              <span className="chip">
                {right}/{Object.keys(marks).length}
              </span>
              <Link href={`/ielts/practice/${s.id}`} className="btn btn-sm btn-secondary">
                <I.IconRefresh /> {t("practiceAgain")}
              </Link>
            </div>
            {[...flags].some((f) => f.startsWith(`${s.id}:`)) && (
              <p className="mb-3 text-sm text-muted">
                {t("flagged")}{" "}
                {[...flags]
                  .filter((f) => f.startsWith(`${s.id}:`))
                  .map((f) => f.split(":")[1])
                  .join(", ")}
              </p>
            )}
            <Questions content={s.content} sid={s.id} values={values} marks={marks} keys={s.answers} only={a.detail.group ?? undefined} />
          </section>
        );
      })}
      {!!a.detail.ai?.length && (
        <section className="mt-6 rounded-2xl border border-line bg-card p-5">
          <h2 className="flex items-center gap-1.5 text-lg font-bold">
            <I.IconSpark className="h-5 w-5 text-accent" /> {t("aiNotes")}
          </h2>
          <ul className="mt-3 space-y-3">
            {a.detail.ai.map((note, i) => (
              <li key={i} className="rounded-xl bg-paper p-3">
                <p className="text-sm font-semibold">{note.question}</p>
                <Markdown text={note.answer} className="mt-1 text-[15px]" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}
