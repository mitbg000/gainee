import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getFormatter, getTranslations } from "next-intl/server";
import Avatar from "@/components/Avatar";
import Shell from "@/components/Shell";
import AccountSettings from "@/components/settings/AccountSettings";
import ProfileSettings from "@/components/settings/ProfileSettings";
import { getDb, schema } from "@/db";
import { getCreditConfig } from "@/lib/credits";
import { fmtCredits } from "@/lib/fmtCredits";
import { imageUrl } from "@/lib/images";
import { getSecurity } from "@/lib/security";
import { dashboardStats, masteredByWeek } from "@/lib/stats";
import { currentUser } from "@/lib/users";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";
const DAYS = 14;

/** The learner's own page: who they are, how learning goes, what the AI cost and what is left. */
export default async function ProfilePage() {
  const me = (await currentUser())!; // Shell sends the logged-out to /login
  const t = await getTranslations("profile");
  const tc = await getTranslations("credits");
  const ta = await getTranslations("admin");
  const f = await getFormatter();
  const db = getDb();
  const c = schema.aiCalls;
  const since = new Date(Date.now() - DAYS * 86_400_000);
  since.setUTCHours(0, 0, 0, 0); // days as the database counts them (UTC)
  const tokens = sql<number>`coalesce(sum(coalesce(${c.promptTokens}, 0) + coalesce(${c.completionTokens}, 0)), 0)`;
  const spent = sql<number>`coalesce(sum(${c.credits}), 0)`;

  const [stats, mastered, [xp], [all], [day], byDay, byTask, groups, cfg, sec] = await Promise.all([
    dashboardStats(),
    masteredByWeek(),
    db.select({ n: sql<number>`coalesce(sum(${schema.activity.xp}), 0)`, minutes: sql<number>`coalesce(sum(${schema.activity.minutes}), 0)` }).from(schema.activity).where(eq(schema.activity.userId, me.id)),
    db.select({ tokens, spent, calls: sql<number>`count(*)` }).from(c).where(and(eq(c.userId, me.id), eq(c.ok, true))),
    db.select({ spent }).from(c).where(and(eq(c.userId, me.id), gte(c.createdAt, new Date(Date.now() - 86_400_000)))),
    db
      .select({ day: sql<string>`date(${c.createdAt})`, tokens, spent })
      .from(c)
      .where(and(eq(c.userId, me.id), eq(c.ok, true), gte(c.createdAt, since)))
      .groupBy(sql`date(${c.createdAt})`),
    db
      .select({ task: c.task, tokens, spent, calls: sql<number>`count(*)` })
      .from(c)
      .where(and(eq(c.userId, me.id), eq(c.ok, true), gte(c.createdAt, new Date(Date.now() - 30 * 86_400_000))))
      .groupBy(c.task)
      .orderBy(desc(spent)),
    db.select({ name: schema.groups.name }).from(schema.userGroups).innerJoin(schema.groups, eq(schema.groups.id, schema.userGroups.groupId)).where(eq(schema.userGroups.userId, me.id)),
    getCreditConfig(),
    getSecurity(),
  ]);

  const admin = me.role === "admin";
  // shortcut: tokens left at the default price, half reading half writing; models with their own price differ
  const perToken = (cfg.default.in + cfg.default.out) / 2 / 1e6;
  const tokensLeft = !admin && perToken > 0 ? Math.max(0, Math.floor(me.credits / perToken)) : null;
  const dailyLeft = !admin && sec.aiCreditsPerDay ? Math.max(0, sec.aiCreditsPerDay - Number(day.spent)) : null;
  const num = (n: number) => f.number(Number(n), { notation: Number(n) >= 100_000 ? "compact" : "standard", maximumFractionDigits: 1 });

  // the last DAYS days, oldest first, empty days included
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(since.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const r = byDay.find((x) => String(x.day).slice(0, 10) === key);
    return { d, tokens: Number(r?.tokens ?? 0), spent: Number(r?.spent ?? 0) };
  });
  const peak = Math.max(1, ...days.map((d) => d.tokens));

  const tile = "rounded-2xl border border-line bg-card p-4";
  const learn = [
    { label: t("streak"), value: stats.streak, icon: I.IconFlame, tone: "text-orange-600 dark:text-orange-400" },
    { label: t("xp"), value: num(Number(xp.n)), icon: I.IconBolt, tone: "text-accent" },
    { label: t("words"), value: num(stats.words), icon: I.IconWords, tone: "text-accent" },
    { label: t("mastered"), value: num(mastered.known), icon: I.IconStar, tone: "text-green-700 dark:text-green-400" },
    { label: t("lessons"), value: num(stats.lessonsDone), icon: I.IconBook, tone: "text-accent" },
    { label: t("minutes"), value: num(Number(xp.minutes)), icon: I.IconClock, tone: "text-accent" },
  ];

  return (
    <Shell wide>
      {/* who */}
      <section className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Avatar url={me.avatar ? imageUrl(me.avatar) : null} name={me.name || me.email} className="size-16 text-2xl" />
        <div className="min-w-0 flex-1 basis-52">
          <h1 className="break-words font-serif text-2xl font-bold md:text-3xl">{me.name || me.email}</h1>
          <p className="break-words text-sm text-muted">
            {me.email} · {ta(`roles.${me.role}`)}
            {groups.length > 0 && ` · ${groups.map((g) => g.name).join(", ")}`} · {t("joined", { date: f.dateTime(me.createdAt, { dateStyle: "medium" }) })}
          </p>
        </div>
        <a href="#me" className="btn btn-sm btn-secondary">
          <I.IconEdit /> {t("edit")}
        </a>
      </section>

      {/* AI and credits */}
      <h2 className="mt-8 font-serif text-xl font-bold">{t("aiTitle")}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={`${tile} col-span-2 lg:col-span-1`}>
          <p className="text-sm text-muted">{t("balance")}</p>
          <p className={`mt-1 font-serif text-3xl font-bold tabular-nums ${!admin && me.credits <= 0 ? "text-red-600 dark:text-red-400" : ""}`}>{admin ? "∞" : fmtCredits(me.credits)}</p>
          <p className="mt-1 text-xs text-muted">{admin ? tc("adminFree") : tokensLeft !== null ? t("tokensLeft", { n: num(tokensLeft) }) : t("free")}</p>
          {!admin && (
            <Link href="/credits" className="btn btn-sm btn-primary mt-3">
              <I.IconCoin className="h-4 w-4" /> {t("topup")}
            </Link>
          )}
        </div>
        <div className={tile}>
          <p className="text-sm text-muted">{t("tokensUsed")}</p>
          <p className="mt-1 font-serif text-3xl font-bold tabular-nums">{num(Number(all.tokens))}</p>
          <p className="mt-1 text-xs text-muted">{t("calls", { n: num(Number(all.calls)) })}</p>
        </div>
        <div className={tile}>
          <p className="text-sm text-muted">{t("creditsUsed")}</p>
          <p className="mt-1 font-serif text-3xl font-bold tabular-nums">{fmtCredits(Number(all.spent))}</p>
          <p className="mt-1 text-xs text-muted">{t("last24", { n: fmtCredits(Number(day.spent)) })}</p>
        </div>
        <div className={tile}>
          <p className="text-sm text-muted">{t("dailyLimit")}</p>
          {dailyLeft !== null ? (
            <>
              <p className="mt-1 font-serif text-3xl font-bold tabular-nums">{fmtCredits(dailyLeft)}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/70">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (Number(day.spent) / sec.aiCreditsPerDay) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">{t("dailyOf", { n: fmtCredits(sec.aiCreditsPerDay) })}</p>
            </>
          ) : (
            <p className="mt-1 font-serif text-3xl font-bold">∞</p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className={tile}>
          <p className="text-sm font-semibold">{t("chartTitle", { n: DAYS })}</p>
          <div className="mt-4 flex h-32 items-end gap-1" role="img" aria-label={t("chartTitle", { n: DAYS })}>
            {days.map((d) => (
              <div key={d.d.toISOString()} className="group relative flex h-full flex-1 flex-col justify-end">
                <div className={`rounded-t ${d.tokens ? "bg-accent" : "bg-line"}`} style={{ height: `${d.tokens ? Math.max(4, (d.tokens / peak) * 100) : 2}%` }} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-paper group-hover:block">
                  {f.dateTime(d.d, { day: "numeric", month: "numeric" })}: {num(d.tokens)} token · {fmtCredits(d.spent)} credit
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>{f.dateTime(days[0].d, { day: "numeric", month: "numeric" })}</span>
            <span>{t("today")}</span>
          </div>
        </div>
        <div className={tile}>
          <p className="text-sm font-semibold">{t("byTask")}</p>
          {byTask.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {byTask.map((r) => (
                <li key={r.task} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{tc.has(`task.${r.task}`) ? tc(`task.${r.task}`) : r.task}</span>
                  <span className="text-xs text-muted tabular-nums">{num(Number(r.tokens))} token</span>
                  <span className="w-16 text-right tabular-nums">{fmtCredits(Number(r.spent))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">{t("noAi")}</p>
          )}
        </div>
      </div>

      {/* learning */}
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

      {/* account and learning profile */}
      <div id="me" className="mt-10 grid scroll-mt-20 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <AccountSettings avatar={me.avatar ? imageUrl(me.avatar) : null} name={me.name ?? ""} email={me.email} />
        <ProfileSettings />
      </div>
    </Shell>
  );
}
