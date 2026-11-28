import Link from "next/link";
import { and, desc, eq, like, or } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import ExportWords from "@/components/ExportWords";
import ShortenWords from "@/components/ShortenWords";
import Shell from "@/components/Shell";
import Notebook from "@/components/words/Notebook";
import DeleteSet from "@/components/words/DeleteSet";
import AddHere from "@/components/words/AddHere";
import CardViewer from "@/components/words/CardViewer";
import { InlineRename } from "@/components/ielts/BookTitle";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
import { imagesForWords } from "@/lib/images";
import { notebookSources, sourceWhere, statusCounts, type Source, type SourceKind } from "@/lib/notebook";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

const { words } = schema;
const ICON: Record<SourceKind, React.ReactNode> = { set: <I.IconCards />, text: <I.IconBook />, listen: <I.IconHeadphones />, ielts: <I.IconClipboard />, other: <I.IconWords /> };
const GROUPS: SourceKind[] = ["set", "text", "listen", "ielts", "other"];

/**
 * Vocabulary notebook. Without ?src: the sets only – your own, then one per reading text, video, IELTS test and
 * "other words". With ?src (or a search ?q): that set as flashcards and a word list, edited in place.
 */
export default async function WordsPage({ searchParams }: { searchParams: Promise<{ q?: string; src?: string; tab?: string }> }) {
  const sp = await searchParams;
  const sources = await notebookSources();
  const q = (sp.q ?? "").trim().slice(0, 100);
  if (!sp.src && !q && sp.tab !== "terms") return <SetsHome sources={sources} />;
  return <SetDetail sources={sources} src={sp.src} q={q} />;
}

async function SetsHome({ sources }: { sources: Source[] }) {
  const t = await getTranslations("notebook");
  const total = (await statusCounts(undefined)).all;
  const card = (s: Source) => (
    <li key={s.key}>
      <Link href={`/words?src=${s.key}`} className="flex h-full items-center gap-3 rounded-2xl border border-line bg-card p-3.5 transition-colors hover:border-accent hover:bg-accent/5">
        <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-paper text-accent [&>svg]:size-5">{ICON[s.kind]}</span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-semibold leading-snug">{s.kind === "other" ? t("other") : s.title}</span>
          <span className="text-xs text-muted">{t("words", { n: s.n })}</span>
        </span>
        <I.IconChevronRight className="h-4 w-4 flex-none text-muted" />
      </Link>
    </li>
  );
  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
        <Link href="/words/sets/new" className="btn btn-primary">
          <I.IconPlus /> {t("newSet")}
        </Link>
      </div>
      <form action="/words" className="mt-4 flex gap-2">
        <input name="q" placeholder={t("search", { n: total })} className="field min-w-0 flex-1" />
        <button className="btn btn-secondary" aria-label={t("searchBtn")}>
          <I.IconDict />
        </button>
      </form>

      {GROUPS.map((kind) => {
        const list = sources.filter((s) => s.kind === kind);
        if (!list.length && kind !== "set") return null;
        return (
          <section key={kind} className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-muted">{t(`group.${kind}`)}</h2>
            {list.length ? (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{list.map(card)}</ul>
            ) : (
              <Link href="/words/sets/new" className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-line p-4 text-sm text-muted hover:border-accent hover:text-accent">
                <I.IconPlus className="h-4 w-4" /> {t("newSet")}
              </Link>
            )}
          </section>
        );
      })}

    </Shell>
  );
}

async function SetDetail({ sources, src, q }: { sources: Source[]; src?: string; q: string }) {
  const t = await getTranslations("notebook");
  const uid = await myId();
  const source = sources.find((s) => s.key === src);
  const like_ = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const where = and(eq(words.userId, uid), sourceWhere(source?.key, uid), q ? or(like(words.term, like_), like(words.meaningVi, like_), like(words.context, like_)) : undefined);
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
        state: words.state,
        scheduledDays: words.scheduledDays,
        due: words.due,
      })
      .from(words)
      .where(where)
      .orderBy(desc(words.id))
      .limit(2000);
  const images = await imagesForWords(rows.map((r) => r.id));
  const title = q ? t("results", { q }) : source ? (source.kind === "other" ? t("other") : source.title) : t("all");
  const setId = source?.kind === "set" ? Number(source.key.slice(4)) : null;
  const textId = source?.kind === "text" ? Number(source.key.slice(5)) : null;
  const long = rows.filter((w) => (w.meaningVi?.length ?? 0) > 40 || (w.definitionEn?.length ?? 0) > 120).map((w) => w.id);

  return (
    <Shell>
      <Link href="/words" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <I.IconArrowLeft className="h-4 w-4" /> {t("title")}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="flex min-w-0 flex-1 font-serif text-2xl font-bold md:text-3xl">{setId ? <InlineRename url={`/api/sets/${setId}`} method="PUT" title={title} /> : title}</h1>
        {setId && (
          <>
            <Link href={`/words/sets/${setId}/edit`} className="icon-btn" aria-label={t("edit")} title={t("edit")}>
              <I.IconEdit />
            </Link>
            <DeleteSet id={setId} title={title} />
          </>
        )}
        {textId && (
          <Link href={`/words/text/${textId}/edit`} className="icon-btn" aria-label={t("edit")} title={t("edit")}>
            <I.IconEdit />
          </Link>
        )}
      </div>

      {rows.length > 0 && <CardViewer cards={rows.map((r) => ({ ...r, images: images.get(r.id) ?? [] }))} />}

      {rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href={`/practice${source ? `?src=${source.key}` : ""}`} className="btn btn-primary">
            <I.IconPlay /> {t("learn")}
          </Link>
          <details className="relative">
            <summary className="btn btn-secondary list-none [&::-webkit-details-marker]:hidden" aria-label={t("more")}>
              ⋯
            </summary>
            <div className="absolute left-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-2 rounded-2xl border border-line bg-card p-3 shadow-xl">
              <ExportWords groups={[{ key: "list", doc: title, part: null, words: rows }]} />
              <ShortenWords ids={long} />
            </div>
          </details>
        </div>
      )}

      {(setId || source?.kind === "other") && (
        <div className="mt-4">
          <AddHere setId={setId ?? undefined} />
        </div>
      )}

      <div className="mt-4">
        {rows.length ? (
          <Notebook rows={rows.map((r) => ({ ...r, images: images.get(r.id) ?? [] }))} sets={sources.filter((s) => s.kind === "set").map((s) => ({ id: Number(s.key.slice(4)), title: s.title }))} source={source?.key} />
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">{q ? t("noResults") : t("empty")}</p>
        )}
      </div>
    </Shell>
  );
}
