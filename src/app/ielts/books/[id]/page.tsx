import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import BookActions from "@/components/ielts/BookActions";
import BookTitle, { InlineRename } from "@/components/ielts/BookTitle";
import FindMarks from "@/components/ielts/FindMarks";
import AudioTest from "@/components/ielts/AudioTest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { scriptLooksBroken } from "@/lib/ielts/import";
import { audioFiles, audioTests, listBooks } from "@/lib/ielts/queries";
import { getSetting } from "@/lib/settings";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

/** Review a book after the AI read it: every section with its warnings, the audio files, and links to fix each part. */
export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const t = await getTranslations("ielts.book");
  const book = (await listBooks()).find((b) => b.id === id);
  if (!book) notFound();
  const [files, usedBy, beat] = await Promise.all([audioFiles(id), audioTests(id), getSetting<number>("worker.heartbeat")]);
  const jobActive = book.job?.status === "queued" || book.job?.status === "running";
  // the worker writes a heartbeat every 30 s; none for 2 minutes means it is not running (AI steps then never start)
  const workerDown = jobActive && (!beat || Date.now() - beat > 120_000);
  const testIds = book.tests.map((x) => x.id);
  const scripts = testIds.length
    ? await getDb().select({ t: schema.ieltsSections.transcript }).from(schema.ieltsSections).where(and(inArray(schema.ieltsSections.testId, testIds), eq(schema.ieltsSections.skill, "listening")))
    : [];
  const brokenScripts = scripts.filter((s) => scriptLooksBroken(s.t) || s.t?.includes("Â")).length;
  const all = book.tests.flatMap((x) => x.sections);
  const reviewed = all.filter((s) => s.reviewed).length;

  return (
    <Shell wide>
      <Link href="/ielts" className="text-sm text-muted hover:underline">
        ← {t("back")}
      </Link>
      <BookTitle id={id} title={book.title} />
      <p className="mt-1 text-sm text-muted">{t("summary", { pages: book.pageCount, tests: book.tests.length, reviewed, total: all.length })}</p>
      <div className="mt-3">
        <BookActions id={id} status={book.status} hasTests={book.tests.length > 0} brokenScripts={brokenScripts} jobActive={jobActive} />
      </div>
      {workerDown && (
        <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {t("workerDown")} <code className="rounded bg-black/10 px-1">pm2 restart gainee-worker</code>
        </p>
      )}
      {book.status === "parsing" && !jobActive && <p className="mt-3 text-sm text-muted">{t("stopped")}</p>}
      {book.error && <p className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{book.error}</p>}
      {book.status === "uploading" && <p className="mt-3 text-sm text-muted">{t("uploading")}</p>}

      <p className="mt-5 text-sm text-muted">{t("howTo")}</p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {book.tests.map((test) => (
          <div key={test.id} className="rounded-2xl border border-line bg-card p-4">
            <h2 className="font-bold">
              <InlineRename url={`/api/ielts/tests/${test.id}`} title={test.title} />
            </h2>
            <ul className="mt-2 divide-y divide-line">
              {test.sections.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                  {s.reviewed ? <I.IconCheckCircle className="h-4 w-4 flex-none text-green-600" /> : <span className="size-4 flex-none rounded-full border-2 border-line" />}
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <b className="flex-none capitalize">
                      {s.skill} {s.part}
                    </b>
                    <InlineRename url={`/api/ielts/sections/${s.id}`} method="PUT" title={s.title ?? ""} placeholder={t("namePart")} allowEmpty className="min-w-0 text-muted" />
                    {s.skill !== "writing" && <span className="flex-none text-muted">· {t("questions", { n: s.groups.reduce((a, g) => a + g.to - g.from + 1, 0) })}</span>}
                  </span>
                  {s.warnings > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{t("warnings", { n: s.warnings })}</span>}
                  {s.skill === "listening" && !s.hasAudio && <I.IconVolumeOff className="h-4 w-4 text-muted" aria-label={t("noAudio")} />}
                  {s.skill === "listening" && s.hasAudio && !s.marked && test.sections.some((o) => o.id !== s.id && o.audio?.fileId === s.audio?.fileId) && (
                    <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{t("noMarks")}</span>
                  )}
                  <Link href={`/ielts/sections/${s.id}/edit`} className="btn btn-sm btn-ghost">
                    <I.IconEdit /> {t("edit")}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {files.length > 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-card p-4">
          <h2 className="font-bold">{t("audioFiles")}</h2>
          <p className="mt-1 text-xs text-muted">{t("marksHint")}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2">
                <I.IconHeadphones className="h-4 w-4 text-muted" />
                <span className="min-w-0 flex-1 basis-40 truncate font-semibold">{f.name}</span>
                <span className="text-muted">{f.received < f.size ? t("incomplete") : `${(f.size / 1048576).toFixed(1)} MB`}</span>
                {f.received >= f.size && !/(section|part)[\s_-]*[1-4]/i.test(f.name) && <FindMarks id={f.id} marks={f.marks} />}
                {f.received >= f.size && book.tests.length > 0 && !/(section|part)[\s_-]*[1-4]/i.test(f.name) && <AudioTest id={f.id} value={usedBy[f.id] ?? null} tests={book.tests.map((x) => ({ id: x.id, title: x.title }))} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}
