import Link from "next/link";
import { desc, eq, like, or } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import AddWord from "@/components/AddWord";
import Shell from "@/components/Shell";
import WordCard from "@/components/WordCard";
import { getDb, schema } from "@/db";
import { imagesForWords } from "@/lib/images";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

const { words, lessons, documents } = schema;

/** Saved words, grouped by text and lesson so they are easy to review. */
export default async function WordsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await getTranslations("wordList");
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const like_ = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const rows = await getDb()
    .select({
      id: words.id,
      term: words.term,
      ipa: words.ipa,
      pos: words.pos,
      meaningVi: words.meaningVi,
      definitionEn: words.definitionEn,
      example: words.example,
      note: words.note,
      context: words.context,
      lessonId: lessons.id,
      position: lessons.position,
      lessonTitle: lessons.title,
      docId: documents.id,
      docTitle: documents.title,
    })
    .from(words)
    .leftJoin(lessons, eq(words.lessonId, lessons.id))
    .leftJoin(documents, eq(lessons.documentId, documents.id))
    .where(q ? or(like(words.term, like_), like(words.meaningVi, like_), like(words.context, like_)) : undefined)
    .orderBy(desc(words.id))
    .limit(2000);

  const images = await imagesForWords(rows.map((r) => r.id));
  type Row = (typeof rows)[number];
  const docs = new Map<number, { title: string; lessons: Map<number, { position: number; title: string; words: Row[] }> }>();
  const other: Row[] = [];
  for (const w of rows) {
    if (!w.docId || !w.lessonId) {
      other.push(w);
      continue;
    }
    const d = docs.get(w.docId) ?? { title: w.docTitle!, lessons: new Map() };
    const l = d.lessons.get(w.lessonId) ?? { position: w.position!, title: w.lessonTitle!, words: [] };
    l.words.push(w);
    d.lessons.set(w.lessonId, l);
    docs.set(w.docId, d); // insertion order = most recently saved word first
  }

  const card = (w: Row) => <WordCard key={w.id} word={w} images={images.get(w.id) ?? []} />;

  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted">
        {t("total", { n: rows.length })}
        {rows.length > 0 && (
          <Link href="/practice" className="btn btn-sm btn-outline">
            <I.IconTarget className="inline-block h-4 w-4 align-[-0.2em]" /> {t("practice")}
          </Link>
        )}
      </p>
      <form className="mt-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder={t("search")} className="field flex-1" />
        <button className="btn btn-secondary">{t("searchBtn")}</button>
      </form>
      <AddWord />
      {rows.length === 0 && <p className="mt-4 text-muted">{q ? t("noResults") : t("empty")}</p>}

      {[...docs].map(([docId, d]) => (
        <details key={docId} open className="mt-6">
          <summary className="cursor-pointer font-serif text-xl font-bold">
            {d.title} <span className="text-sm font-normal text-muted">· {t("count", { n: [...d.lessons.values()].reduce((a, l) => a + l.words.length, 0) })}</span>
          </summary>
          {[...d.lessons].sort((a, b) => a[1].position - b[1].position).map(([lessonId, l]) => (
            <section key={lessonId} className="mt-3">
              <Link href={`/lessons/${lessonId}`} className="text-sm font-semibold text-accent underline">
                {t("part", { n: l.position })} · {l.title} ({l.words.length})
              </Link>
              <ul className="mt-2 space-y-2">{l.words.map(card)}</ul>
            </section>
          ))}
        </details>
      ))}

      {other.length > 0 && (
        <details open className="mt-6">
          <summary className="cursor-pointer font-serif text-xl font-bold">
            {t("other")} <span className="text-sm font-normal text-muted">· {t("count", { n: other.length })}</span>
          </summary>
          <ul className="mt-3 space-y-2">{other.map(card)}</ul>
        </details>
      )}
    </Shell>
  );
}
