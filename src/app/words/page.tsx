import Link from "next/link";
import { desc, eq, like, or } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import AddWord from "@/components/AddWord";
import ExportWords, { type ExportGroup } from "@/components/ExportWords";
import ShortenWords from "@/components/ShortenWords";
import Shell from "@/components/Shell";
import WordCard from "@/components/WordCard";
import { getDb, schema } from "@/db";
import { imagesForWords } from "@/lib/images";
import { listSets, textSets } from "@/lib/sets";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

const { words, lessons, documents } = schema;

/** Vocabulary notebook: study sets (Quizlet-style) and every saved term, grouped by text and lesson. */
export default async function WordsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const t = await getTranslations("wordList");
  const sp = await searchParams;
  if (sp.tab !== "terms" && !sp.q) return <SetsHome />;
  const q = (sp.q ?? "").trim().slice(0, 100);
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

  const pick = (w: Row) => ({ term: w.term, ipa: w.ipa, pos: w.pos, meaningVi: w.meaningVi, definitionEn: w.definitionEn, example: w.example });
  const groups: ExportGroup[] = [
    ...[...docs].flatMap(([docId, d]) =>
      [...d.lessons]
        .sort((a, b) => a[1].position - b[1].position)
        .map(([lessonId, l]) => ({ key: `${docId}-${lessonId}`, doc: d.title, part: `${t("part", { n: l.position })} · ${l.title}`, words: l.words.map(pick) })),
    ),
    ...(other.length ? [{ key: "other", doc: t("other"), part: null, words: other.map(pick) }] : []),
  ];

  const card = (w: Row) => <WordCard key={w.id} word={w} images={images.get(w.id) ?? []} />;

  return (
    <Shell>
      <Header tab="terms" />
      <p className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
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
      {rows.length > 0 && <ExportWords groups={groups} />}
      {/* meanings copied whole from the dictionary are hard to memorise */}
      <ShortenWords ids={rows.filter((w) => (w.meaningVi?.length ?? 0) > 40 || (w.definitionEn?.length ?? 0) > 120).map((w) => w.id)} />
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

async function Header({ tab }: { tab: "sets" | "terms" }) {
  const t = await getTranslations("sets");
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-serif text-3xl font-bold md:text-4xl">{t("notebook")}</h1>
        <Link href="/words/sets/new" className="btn btn-primary">
          <I.IconPlus /> {t("newSet")}
        </Link>
      </div>
      <div role="tablist" className="mt-4 flex gap-1 border-b border-line">
        {(["sets", "terms"] as const).map((k) => (
          <Link key={k} role="tab" aria-selected={tab === k} href={k === "sets" ? "/words" : "/words?tab=terms"} className="tab">
            {t(`tab.${k}`)}
          </Link>
        ))}
      </div>
    </>
  );
}

/** Study sets you made, then the words of each reading text as ready-made sets. */
async function SetsHome() {
  const t = await getTranslations("sets");
  const [sets, texts] = await Promise.all([listSets(), textSets()]);
  const card = (href: string, title: string, n: number, sub?: string | null) => (
    <li key={href}>
      <Link href={href} className="flex h-full flex-col rounded-2xl border-2 border-line bg-card p-4 transition-colors hover:border-accent/60">
        <span className="line-clamp-2 font-serif text-lg font-bold leading-snug">{title}</span>
        <span className="mt-auto flex items-center gap-2 pt-3 text-sm">
          <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-muted">{t("terms", { n })}</span>
          {sub && <span className="truncate text-xs text-muted">{sub}</span>}
        </span>
      </Link>
    </li>
  );
  return (
    <Shell>
      <Header tab="sets" />
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">{t("mySets")}</h2>
      {sets.length ? (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sets.map((s) => card(`/words/sets/${s.id}`, s.title, s.n, s.description))}</ul>
      ) : (
        <div className="mt-3 rounded-2xl border-2 border-dashed border-line p-8 text-center">
          <p className="text-muted">{t("noSets")}</p>
          <Link href="/words/sets/new" className="btn btn-primary mt-3">
            <I.IconPlus /> {t("newSet")}
          </Link>
        </div>
      )}
      {texts.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">{t("byText")}</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{texts.map((d) => card(`/words/text/${d.id}`, d.title, d.n, t("fromText")))}</ul>
        </>
      )}
    </Shell>
  );
}
