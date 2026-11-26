import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import ListenChunks from "@/components/listen/ListenChunks";
import Practice from "@/components/listen/Practice";
import { getSource } from "@/lib/listen/queries";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

const KINDS = ["dictation", "gaps", "listen"] as const;

/** One recording from start to end: dictation sentence by sentence (the place is remembered), gaps, or listen only. */
export default async function SourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string; from?: string }> }) {
  const t = await getTranslations("listen");
  const r = await getSource(Number((await params).id));
  if (!r) notFound();
  const q = await searchParams;
  const kind = KINDS.find((k) => k === q.kind) ?? "dictation";
  const items = r.play.filter((x) => !r.items.find((i) => i.id === x.id)?.hidden);
  const from = q.from === "0" ? 0 : r.source.position;

  return (
    <Shell full>
      <div className="mx-auto max-w-[96rem]">
        <Link href="/listen" className="text-sm text-muted hover:text-ink">
          ← {t("title")}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-bold md:text-3xl">{r.source.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {KINDS.map((k) => (
            <Link key={k} href={`/listen/${r.source.id}?kind=${k}`} className={`chip ${kind === k ? "chip-on" : ""}`}>
              {t(`modes.${k}`)}
            </Link>
          ))}
          {kind !== "listen" && from > 0 && (
            <Link href={`/listen/${r.source.id}?kind=${kind}&from=0`} className="btn btn-sm btn-ghost">
              <I.IconRefresh /> {t("restart")}
            </Link>
          )}
          <Link href={`/listen/${r.source.id}/edit`} className="btn btn-sm btn-ghost ml-auto">
            <I.IconEdit /> {t("review")}
          </Link>
          {r.saved.length > 0 && <span className="text-xs text-muted">{t("savedWords", { n: r.saved.length })}</span>}
        </div>
        {!r.source.reviewed && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{t("reviewFirst")}</p>}
        <div className="mt-5">
          {!r.media || !items.length ? (
            <p className="text-muted">{t("noMedia")}</p>
          ) : kind === "listen" ? (
            <ListenChunks items={items} title={r.source.title} saved={r.saved} sourceId={r.source.id} />
          ) : (
            <Practice key={`${kind}-${from}`} items={items} titles={{ [r.source.id]: r.source.title }} saved={r.saved} mode="source" kind={kind} sourceId={r.source.id} startIdx={from >= (items.at(-1)?.idx ?? 0) + 1 ? 0 : from} backHref={`/listen/${r.source.id}`} />
          )}
        </div>
      </div>
    </Shell>
  );
}
