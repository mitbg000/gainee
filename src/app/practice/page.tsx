import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import WordPractice from "@/components/practice/WordPractice";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";
const { words, lessons, documents } = schema;

/** Free practice with saved words (quizzes); unlike "Today's review" it does not change the review schedule. */
export default async function PracticePage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const t = await getTranslations("practice");
  const doc = Number((await searchParams).doc) || null;
  const rows = await getDb()
    .select({ id: words.id, term: words.term, ipa: words.ipa, pos: words.pos, meaningVi: words.meaningVi, definitionEn: words.definitionEn, context: words.context, docId: documents.id, docTitle: documents.title })
    .from(words)
    .leftJoin(lessons, eq(words.lessonId, lessons.id))
    .leftJoin(documents, eq(lessons.documentId, documents.id))
    .where(eq(words.suspended, false))
    .orderBy(desc(words.id))
    .limit(3000);

  const groups = new Map<number, { title: string; n: number }>();
  for (const r of rows) if (r.docId) groups.set(r.docId, { title: r.docTitle!, n: (groups.get(r.docId)?.n ?? 0) + 1 });
  const pool = doc ? rows.filter((r) => r.docId === doc) : rows;
  const chip = (active: boolean) => `chip ${active ? "chip-on" : ""}`;

  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      {groups.size > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Link href="/practice" className={chip(!doc)}>
            {t("all")} · {rows.length}
          </Link>
          {[...groups].map(([id, g]) => (
            <Link key={id} href={`/practice?doc=${id}`} className={chip(doc === id)} title={g.title}>
              <span className="max-w-[14rem] truncate">{g.title}</span>&nbsp;· {g.n}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-6">
        <WordPractice key={doc ?? 0} words={pool} all={rows.map((r) => ({ term: r.term, meaning: r.meaningVi || r.definitionEn || "" }))} />
      </div>
    </Shell>
  );
}
