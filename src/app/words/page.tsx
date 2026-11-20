import Link from "next/link";
import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import RemoveWord from "@/components/RemoveWord";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function WordsPage() {
  const t = await getTranslations("wordList");
  const rows = await getDb()
    .select({ id: schema.words.id, term: schema.words.term, ipa: schema.words.ipa, meaningVi: schema.words.meaningVi, context: schema.words.context, lessonId: schema.words.lessonId })
    .from(schema.words)
    .orderBy(desc(schema.words.id))
    .limit(500);
  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      {rows.length === 0 && <p className="mt-4 text-muted">{t("empty")}</p>}
      <ul className="mt-5 space-y-2">
        {rows.map((w) => (
          <li key={w.id} className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
            <div className="min-w-0 flex-1">
              <div className="font-serif text-xl font-bold">
                {w.term} {w.ipa && <span className="text-sm font-normal text-muted">{w.ipa}</span>}
              </div>
              {w.meaningVi && <div className="text-accent">{w.meaningVi}</div>}
              {w.context && <div className="mt-1 text-sm italic text-muted">{w.context}</div>}
              {w.lessonId && (
                <Link href={`/lessons/${w.lessonId}`} className="mt-1 inline-block text-sm text-accent underline">
                  {t("fromLesson")}
                </Link>
              )}
            </div>
            <RemoveWord id={w.id} label={t("remove")} />
          </li>
        ))}
      </ul>
    </Shell>
  );
}
