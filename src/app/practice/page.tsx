import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import WordPractice from "@/components/practice/WordPractice";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
import { dueByDocument } from "@/lib/review";
import { imagesForWords } from "@/lib/images";
import { notebookSources, sourceWhere } from "@/lib/notebook";

export const dynamic = "force-dynamic";
const { words } = schema;

/** Free practice with saved words (quizzes); unlike "Today's review" it does not change the review schedule. */
export default async function PracticePage({ searchParams }: { searchParams: Promise<{ src?: string; doc?: string }> }) {
  const t = await getTranslations("practice");
  const tn = await getTranslations("notebook");
  const sp = await searchParams;
  const uid = await myId();
  const sources = await notebookSources();
  // ?doc= from older links is the text's set
  const src = sources.find((s) => s.key === (sp.src ?? (sp.doc ? `text:${Number(sp.doc)}` : "")))?.key;
  const [rows, all] = await Promise.all([
    getDb()
      .select({ id: words.id, term: words.term, ipa: words.ipa, pos: words.pos, meaningVi: words.meaningVi, definitionEn: words.definitionEn, context: words.context, example: words.example, mnemonic: words.mnemonic, lapses: words.lapses, reps: words.reps, state: words.state, scheduledDays: words.scheduledDays, due: words.due })
      .from(words)
      .where(and(eq(words.userId, uid), eq(words.suspended, false), sourceWhere(src, uid)))
      .orderBy(desc(words.id))
      .limit(3000),
    // wrong choices in quizzes come from every saved word
    getDb().select({ term: words.term, meaningVi: words.meaningVi, definitionEn: words.definitionEn }).from(words).where(eq(words.userId, uid)).orderBy(desc(words.id)).limit(3000),
  ]);

  const due = (await dueByDocument()).reduce((a, g) => a + g.n, 0);
  const images = await imagesForWords(rows.map((r) => r.id));
  const pool = rows.map((r) => ({ ...r, images: images.get(r.id) ?? [] }));
  const chip = (active: boolean) => `chip flex-none ${active ? "chip-on" : ""}`;
  const total = all.length;

  return (
    <Shell>
      <WordPractice key={src ?? "all"} title={t("title")} words={pool} all={all.map((r) => ({ term: r.term, meaning: r.meaningVi || r.definitionEn || "" }))} due={due}>
        {sources.length > 0 && (
          <div className="mt-4 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link href="/practice" className={chip(!src)}>
              {t("all")} · {total}
            </Link>
            {sources.map((g) => (
              <Link key={g.key} href={`/practice?src=${g.key}`} className={chip(src === g.key)} title={g.kind === "other" ? tn("other") : g.title}>
                <span className="max-w-[14rem] truncate">{g.kind === "other" ? tn("other") : g.title}</span>&nbsp;· {g.n}
              </Link>
            ))}
          </div>
        )}
      </WordPractice>
    </Shell>
  );
}
