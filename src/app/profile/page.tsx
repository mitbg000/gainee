import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { getFormatter, getTranslations } from "next-intl/server";
import Avatar from "@/components/Avatar";
import GoalBars from "@/components/GoalBars";
import Shell from "@/components/Shell";
import ProfileEdit from "@/components/settings/ProfileEdit";
import { getDb, schema } from "@/db";
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
  const tp = await getTranslations("settings.profile");
  const ta = await getTranslations("admin");
  const f = await getFormatter();
  const db = getDb();
  const c = schema.aiCalls;

  const [stats, mastered, [xp], goals, profile, groups, [used]] = await Promise.all([
    dashboardStats(),
    masteredByWeek(),
    db.select({ n: sql<number>`coalesce(sum(${schema.activity.xp}), 0)`, minutes: sql<number>`coalesce(sum(${schema.activity.minutes}), 0)` }).from(schema.activity).where(eq(schema.activity.userId, me.id)),
    goalProgress(),
    getProfile(),
    db.select({ name: schema.groups.name }).from(schema.userGroups).innerJoin(schema.groups, eq(schema.groups.id, schema.userGroups.groupId)).where(eq(schema.userGroups.userId, me.id)),
    db.select({ n: sql<number>`coalesce(sum(${c.credits}), 0)` }).from(c).where(and(eq(c.userId, me.id), gte(c.createdAt, new Date(Date.now() - 30 * 86_400_000)))),
  ]);
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
  const facts = [
    `${tp("levelShort")} ${profile.level}`,
    `${tp("bandShort")} ${profile.targetBand}`,
    `${tp("explainShort")} ${profile.explainIn === "vi" ? "Tiếng Việt" : "English"}`,
    tp("wordsShort", { n: profile.lessonWords }),
  ];

  return (
    <Shell wide>
      {/* who, in short; Edit opens the forms */}
      <ProfileEdit account={{ avatar, name: me.name ?? "", email: me.email }}>
        <div className="flex items-center gap-4">
          <Avatar url={avatar} name={me.name || me.email} className="size-16 text-2xl" />
          <div className="min-w-0">
            <h1 className="break-words font-serif text-2xl font-bold md:text-3xl">{me.name || me.email}</h1>
            <p className="break-words text-sm text-muted">
              {me.email} · {ta(`roles.${me.role}`)}
              {groups.length > 0 && ` · ${groups.map((g) => g.name).join(", ")}`}
            </p>
          </div>
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {facts.map((x) => (
            <li key={x} className="rounded-full bg-paper px-2.5 py-1 text-muted">
              {x}
            </li>
          ))}
        </ul>
      </ProfileEdit>

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

      {/* credits, one line */}
      <section className={`${tile} mt-8 flex flex-wrap items-center gap-x-6 gap-y-2`}>
        <I.IconCoin className="h-5 w-5 text-accent" />
        <p className="text-sm">
          <span className="text-muted">{t("balance")}</span>{" "}
          <span className={`font-semibold tabular-nums ${!admin && me.credits <= 0 ? "text-red-600 dark:text-red-400" : ""}`}>{admin ? "∞" : `${fmtCredits(me.credits)} credit`}</span>
        </p>
        <p className="text-sm text-muted">{t("used30", { n: fmtCredits(Number(used.n)) })}</p>
        {!admin && (
          <Link href="/credits" className="btn btn-sm btn-secondary ml-auto">
            {t("topup")}
          </Link>
        )}
      </section>
    </Shell>
  );
}
