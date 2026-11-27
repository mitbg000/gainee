import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { getFormatter, getTranslations } from "next-intl/server";
import GoalBars from "@/components/GoalBars";
import Shell from "@/components/Shell";
import ProfileEdit from "@/components/settings/ProfileEdit";
import { getDb, schema } from "@/db";
import { getCreditConfig } from "@/lib/credits";
import { fmtCredits } from "@/lib/fmtCredits";
import { goalProgress } from "@/lib/goals";
import { imageUrl } from "@/lib/images";
import { getProfile } from "@/lib/profile";
import { dashboardStats, masteredByWeek } from "@/lib/stats";
import { currentUser } from "@/lib/users";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

/** The learner's own page: a short summary of who they are, mostly how learning goes, and a line about credits. */
export default async function ProfilePage() {
  const me = (await currentUser())!; // Shell sends the logged-out to /login
  const t = await getTranslations("profile");
  const ta = await getTranslations("admin");
  const f = await getFormatter();
  const db = getDb();
  const c = schema.aiCalls;

  const tokens = sql<number>`coalesce(sum(coalesce(${c.promptTokens}, 0) + coalesce(${c.completionTokens}, 0)), 0)`;
  const [stats, mastered, [xp], goals, profile, groups, [used], cfg] = await Promise.all([
    dashboardStats(),
    masteredByWeek(),
    db.select({ n: sql<number>`coalesce(sum(${schema.activity.xp}), 0)`, minutes: sql<number>`coalesce(sum(${schema.activity.minutes}), 0)` }).from(schema.activity).where(eq(schema.activity.userId, me.id)),
    goalProgress(),
    getProfile(),
    db.select({ name: schema.groups.name }).from(schema.userGroups).innerJoin(schema.groups, eq(schema.groups.id, schema.userGroups.groupId)).where(eq(schema.userGroups.userId, me.id)),
    db.select({ credits: sql<number>`coalesce(sum(${c.credits}), 0)`, tokens }).from(c).where(and(eq(c.userId, me.id), gte(c.createdAt, new Date(Date.now() - 30 * 86_400_000)))),
    getCreditConfig(),
  ]);
  // shortcut: tokens left at the default price, half reading half writing; models with their own price differ
  const perToken = (cfg.default.in + cfg.default.out) / 2 / 1e6;
  const admin = me.role === "admin";
  const num = (n: number) => f.number(Number(n), { notation: Number(n) >= 100_000 ? "compact" : "standard", maximumFractionDigits: 1 });
  const avatar = me.avatar ? imageUrl(me.avatar) : null;
  const tile = "rounded-2xl border border-line bg-card p-4";
  const learn = [
    { label: t("streak"), value: stats.streak, icon: I.IconFlame, tone: "text-orange-600 dark:text-orange-400" },
    { label: t("xp"), value: num(Number(xp.n)), icon: I.IconBolt, tone: "text-accent" },
    { label: t("minutes"), value: num(Number(xp.minutes)), icon: I.IconClock, tone: "text-accent" },
    { label: t("lessons"), value: num(stats.lessonsDone), icon: I.IconBook, tone: "text-accent" },
    { label: t("words"), value: num(stats.words), icon: I.IconWords, tone: "text-accent" },
    { label: t("mastered"), value: num(mastered.known), icon: I.IconStar, tone: "text-green-700 dark:text-green-400" },
  ];

  return (
    <Shell wide>
      {/* who, in short; Edit opens one form */}
      <ProfileEdit avatar={avatar} name={me.name ?? ""} email={me.email} sub={[me.email, ta(`roles.${me.role}`), ...groups.map((g) => g.name)].join(" · ")} profile={profile} />

      {/* learning: the heart of the page */}
      <div className="mt-8 flex items-baseline gap-3">
        <h2 className="font-serif text-xl font-bold">{t("learnTitle")}</h2>
        <Link href="/progress" className="ml-auto text-sm text-accent hover:underline">
          {t("allProgress")} →
        </Link>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {learn.map(({ label, value, icon: Icon, tone }) => (
          <li key={label} className={tile}>
            <Icon className={`h-5 w-5 ${tone}`} />
            <p className="mt-2 font-serif text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-xs text-muted">{label}</p>
          </li>
        ))}
      </ul>
      {goals.length > 0 && (
        <section className={`${tile} mt-3 p-5`}>
          <p className="mb-3 text-sm font-semibold">{t("goalsTitle")}</p>
          <GoalBars goals={goals} />
        </section>
      )}

      {/* AI and credits, in short */}
      <section className={`${tile} mt-8 p-5`}>
        <div className="flex items-center gap-2">
          <I.IconSpark className="h-5 w-5 text-accent" />
          <h2 className="font-semibold">{t("aiTitle")}</h2>
          {!admin && (
            <Link href="/credits" className="btn btn-sm btn-primary ml-auto">
              <I.IconCoin className="h-4 w-4" /> {t("topup")}
            </Link>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            [t("balance"), admin ? "∞" : fmtCredits(me.credits), !admin && me.credits <= 0],
            [t("tokensLeftShort"), admin || perToken <= 0 ? "∞" : `≈ ${num(Math.floor(Math.max(0, me.credits) / perToken))}`, false],
            [t("tokensUsed30"), num(Number(used.tokens)), false],
            [t("creditsUsed30"), fmtCredits(Number(used.credits)), false],
          ].map(([label, value, low]) => (
            <div key={String(label)}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className={`mt-0.5 font-serif text-2xl font-bold tabular-nums ${low ? "text-red-600 dark:text-red-400" : ""}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Shell>
  );
}
