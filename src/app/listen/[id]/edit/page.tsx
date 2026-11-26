import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import ListenEditor from "@/components/listen/ListenEditor";
import { getSource } from "@/lib/listen/queries";

export const dynamic = "force-dynamic";

export default async function EditSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("listen");
  const r = await getSource(Number((await params).id));
  if (!r) notFound();
  return (
    <Shell wide>
      <Link href={`/listen/${r.source.id}`} className="text-sm text-muted hover:text-ink">
        ← {r.source.title}
      </Link>
      <h1 className="mt-2 font-serif text-2xl font-bold">{t("edit.heading")}</h1>
      <p className="mt-1 text-sm text-muted">{t("edit.intro")}</p>
      <div className="mt-5">
        {r.media ? (
          <ListenEditor
            sourceId={r.source.id}
            title={r.source.title}
            shift={r.source.shift}
            media={r.media}
            captions={r.source.captions}
            rows={r.items.map((i) => ({ id: i.id, start: i.start, end: i.end, text: i.text, speaker: i.speaker, hidden: i.hidden, confidence: i.confidence }))}
          />
        ) : (
          <p className="text-muted">{t("noMedia")}</p>
        )}
      </div>
    </Shell>
  );
}
