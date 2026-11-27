import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import ReviewSession from "@/components/review/ReviewSession";
import Shell from "@/components/Shell";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
import { dueByDocument, reviewForecast } from "@/lib/review";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const t = await getTranslations("review");
  const doc = Number((await searchParams).doc) || undefined;
  const { words } = schema;
  const [groups, forecast, pool] = await Promise.all([
    dueByDocument(),
    reviewForecast(doc),
    // other saved words: wrong choices for the questions
    getDb().select({ term: words.term, pos: words.pos, meaningVi: words.meaningVi, definitionEn: words.definitionEn }).from(words).where(eq(words.userId, await myId())).orderBy(desc(words.id)).limit(300),
  ]);
  const total = groups.reduce((a, g) => a + g.n, 0);
  const chip = (active: boolean) => `chip ${active ? "chip-on" : ""}`;

  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      {groups.some((g) => g.id) && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Link href="/review" className={chip(!doc)}>
            {t("all")} · {total}
          </Link>
          {groups
            .filter((g) => g.id)
            .map((g) => (
              <Link key={g.id} href={`/review?doc=${g.id}`} className={chip(doc === g.id)} title={g.title ?? ""}>
                <span className="max-w-[14rem] truncate">{g.title}</span>&nbsp;· {g.n}
              </Link>
            ))}
        </div>
      )}
      <div className="mt-6">
        <ReviewSession key={doc ?? 0} doc={doc} forecast={{ ...forecast, next: forecast.next?.toISOString() ?? null }} pool={pool} />
      </div>
    </Shell>
  );
}
