import Link from "next/link";
import { getTranslations } from "next-intl/server";
import ReviewSession from "@/components/review/ReviewSession";
import Shell from "@/components/Shell";
import { dueByDocument } from "@/lib/review";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const t = await getTranslations("review");
  const doc = Number((await searchParams).doc) || undefined;
  const groups = await dueByDocument();
  const total = groups.reduce((a, g) => a + g.n, 0);
  const chip = (active: boolean) => `flex min-h-9 items-center rounded-full border px-3 text-sm ${active ? "border-accent bg-accent text-on-accent" : "border-line bg-card hover:border-accent"}`;

  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("due", { n: total })}</p>
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
        <ReviewSession key={doc ?? 0} doc={doc} />
      </div>
    </Shell>
  );
}
