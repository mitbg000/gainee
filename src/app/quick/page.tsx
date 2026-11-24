import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import QuickSession from "@/components/learn/QuickSession";
import Shell from "@/components/Shell";
import { getDb, schema } from "@/db";
import { today } from "@/lib/activity";
import { masteredByWeek, streak } from "@/lib/stats";

export const dynamic = "force-dynamic";
const { words, activity } = schema;

/** Quick study (about 5 minutes): due cards, two sentences of your own, one match round. */
export default async function QuickPage() {
  const t = await getTranslations("learn.quick");
  const db = getDb();
  const [pool, s, [act], m] = await Promise.all([
    // words being learnt (studied at least once) first, newest first; they are the ones worth using in a sentence
    db
      .select({ id: words.id, term: words.term, ipa: words.ipa, pos: words.pos, meaningVi: words.meaningVi, definitionEn: words.definitionEn, context: words.context })
      .from(words)
      .where(isNotNull(words.meaningVi))
      .orderBy(desc(sql`${words.reps} > 0`), desc(words.lastReview), desc(words.id))
      .limit(40),
    streak(),
    db.select({ xp: activity.xp, minutes: activity.minutes }).from(activity).where(eq(activity.day, today())),
    masteredByWeek(),
  ]);
  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <p className="mt-1 text-muted">{t("intro")}</p>
      <div className="mt-6">
        <QuickSession pool={pool} streak={s} activeToday={!!act && (act.xp > 0 || act.minutes > 0)} known={m.known} />
      </div>
    </Shell>
  );
}
