import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import WordPractice from "@/components/practice/WordPractice";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
import { dueByDocument } from "@/lib/review";
import { imagesForWords } from "@/lib/images";

export const dynamic = "force-dynamic";
const { words, lessons, documents } = schema;

/** Free practice with saved words (quizzes); unlike "Today's review" it does not change the review schedule. */
export default async function PracticePage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const t = await getTranslations("practice");
  const doc = Number((await searchParams).doc) || null;
  const rows = await getDb()
    .select({ id: words.id, term: words.term, ipa: words.ipa, pos: words.pos, meaningVi: words.meaningVi, definitionEn: words.definitionEn, context: words.context, example: words.example, mnemonic: words.mnemonic, lapses: words.lapses, reps: words.reps, docId: documents.id, docTitle: documents.title })
    .from(words)
    .leftJoin(lessons, eq(words.lessonId, lessons.id))
    .leftJoin(documents, eq(lessons.documentId, documents.id))
    .where(and(eq(words.userId, await myId()), eq(words.suspended, false)))
    .orderBy(desc(words.id))
    .limit(3000);

  const due = (await dueByDocument()).reduce((a, g) => a + g.n, 0);
  const groups = new Map<number, { title: string; n: number }>();
  for (const r of rows) if (r.docId) groups.set(r.docId, { title: r.docTitle!, n: (groups.get(r.docId)?.n ?? 0) + 1 });
  const images = await imagesForWords(rows.map((r) => r.id));
  const pool = (doc ? rows.filter((r) => r.docId === doc) : rows).map((r) => ({ ...r, images: images.get(r.id) ?? [] }));
  const chip = (active: boolean) => `chip ${active ? "chip-on" : ""}`;

  return (
    <Shell>
      <WordPractice key={doc ?? 0} title={t("title")} words={pool} all={rows.map((r) => ({ term: r.term, meaning: r.meaningVi || r.definitionEn || "" }))} due={due}>
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
      </WordPractice>
    </Shell>
  );
}
