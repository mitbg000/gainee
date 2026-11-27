import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import QuickSession from "@/components/learn/QuickSession";
import Shell from "@/components/Shell";
import { getDb, schema } from "@/db";
import { today } from "@/lib/activity";
import { myId } from "@/lib/owner";
import { quickCounts, quickWords } from "@/lib/review";
import { streak } from "@/lib/stats";

export const dynamic = "force-dynamic";
const { activity } = schema;

/** Quick study: words due for review first, then a few new words; questions of mixed kinds, graded for FSRS. */
export default async function QuickPage({ searchParams }: { searchParams: Promise<{ skip?: string }> }) {
  const t = await getTranslations("learn.quick");
  const uid = await myId();
  // words of earlier rounds in this sitting, newest last (kept short: the URL carries them)
  const skip = ((await searchParams).skip ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(-300);
  const [review, learn, s, [act], counts] = await Promise.all([
    quickWords("review", 10, skip),
    quickWords("learn", 5, skip),
    streak(),
    getDb().select({ xp: activity.xp, minutes: activity.minutes }).from(activity).where(and(eq(activity.userId, uid), eq(activity.day, today()))),
    quickCounts(),
  ]);
  const ids = [...review.words, ...learn.words].map((w) => w.id);
  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <p className="mt-1 text-muted">{t("intro", { due: counts.due, fresh: counts.fresh, learned: counts.learned })}</p>
      <div className="mt-6">
        {/* a new set after "again": the page data changes, so the session starts over */}
        <QuickSession key={ids.join(",")} skip={skip} review={review.words} learn={learn.words} others={[...review.others, ...learn.others]} streak={s} activeToday={!!act && (act.xp > 0 || act.minutes > 0)} learned={counts.learned} />
      </div>
    </Shell>
  );
}
