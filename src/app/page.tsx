import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { dashboardStats, nextLesson } from "@/lib/stats";
import { goalProgress } from "@/lib/goals";
import { dueCount as listenDue } from "@/lib/listen/queries";
import GoalBars from "@/components/GoalBars";
import Shell from "@/components/Shell";
import JobsPanel from "@/components/JobsPanel";
import InstallPrompt from "@/components/InstallPrompt";
import * as I from "@/components/icons";
import Landing from "@/components/Landing";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

async function loadStats() {
  const [s, hb, next, goals, listen] = await Promise.all([dashboardStats(), getSetting<number>("worker.heartbeat"), nextLesson(), goalProgress(), listenDue()]);
  return { ...s, heartbeat: hb ?? 0, next, goals, listen };
}

export default async function DashboardPage() {
  const me = await currentUser();
  if (!me) return <Landing />; // visitors (the middleware lets "/" through without a session)
  const admin = me.role === "admin"; // server state and test tools are for the admin
  const t = await getTranslations("dashboard");
  let stats: Awaited<ReturnType<typeof loadStats>> | null = null;
  let dbError = "";
  try {
    stats = await loadStats();
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }
  const ago = stats ? Math.round((Date.now() - stats.heartbeat) / 1000) : 0;
  const workerAlive = !!stats?.heartbeat && ago < 90;

  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-widest text-accent2">{t("kicker")}</p>
      <h1 className="mt-1 font-serif text-3xl font-bold md:text-4xl">{t("greeting")}</h1>

      <InstallPrompt />

      {stats?.next ? (
        <Link href={`/lessons/${stats.next.id}`} className="mt-4 block rounded-2xl bg-accent p-4 text-on-accent">
          <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{t("continue")}</div>
          <div className="mt-1 font-serif text-xl font-bold">{stats.next.title}</div>
          <div className="text-sm opacity-90">
            {stats.next.documentTitle} · {t("part", { n: stats.next.position })}
          </div>
        </Link>
      ) : (
        <Link href="/import" className="mt-4 flex min-h-11 items-center rounded-2xl border border-dashed border-accent px-4 py-3 font-medium text-accent">
          + {t("importFirst")}
        </Link>
      )}

      {!!stats?.listen && (
        <Link href="/listen/session?mode=review" className="mt-3 flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-card px-4 py-3 font-medium hover:border-accent">
          <I.IconHeadphones className="h-5 w-5 text-accent" /> {t("listenDue", { n: stats.listen })}
          <I.IconArrowRight className="ml-auto h-4 w-4 text-muted" />
        </Link>
      )}

      <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
        {(["streak", "xpToday", "lessonsDone", "words", "documents"] as const).map((k) => (
          <div key={k} className={`rounded-2xl border border-line bg-card p-3 sm:p-4 ${k === "documents" ? "hidden sm:block" : ""} ${k === "words" ? "hidden sm:block" : ""}`}>
            <div className="text-xs text-muted sm:text-sm">{t(`stats.${k}`)}</div>
            <div className="mt-1 text-2xl font-bold sm:text-3xl">
              {stats ? stats[k] : "–"}
              {k === "streak" && stats && stats.streak > 0 && <I.IconFlame className="ml-1 inline-block h-6 w-6 align-[-0.15em] text-orange-500" />}
            </div>
          </div>
        ))}
      </div>

      {stats && stats.goals.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-xl font-bold">{t("goals")}</h2>
            <Link href="/progress" className="text-sm text-accent underline">
              {t("allProgress")}
            </Link>
          </div>
          <div className="mt-3">
            <GoalBars goals={stats.goals} />
          </div>
        </section>
      )}

      {admin && (
      <section className="mt-6 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-serif text-xl font-bold">{t("system.title")}</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li className="flex items-center gap-1.5"><I.IconCheckCircle className="h-4 w-4 text-green-600" /> {t("system.web")}</li>
          <li className="flex items-center gap-1.5">{dbError ? <><I.IconXCircle className="h-4 w-4 flex-none text-red-600" /> {t("system.dbError", { error: dbError })}</> : <><I.IconCheckCircle className="h-4 w-4 text-green-600" /> {t("system.db")}</>}</li>
          <li>
            {workerAlive ? <I.IconCheckCircle className="inline-block h-4 w-4 align-[-0.2em] text-green-600" /> : <I.IconAlert className="inline-block h-4 w-4 align-[-0.2em] text-amber-600" />}{" "}
            {workerAlive
              ? t("system.workerAlive", { seconds: ago })
              : stats?.heartbeat
                ? t("system.workerLost", { seconds: ago })
                : t("system.workerNever")}
          </li>
        </ul>
      </section>
      )}

      {admin && (
      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-muted">{t("advanced")}</summary>
        <JobsPanel />
        <Link href="/read/demo" className="mt-3 inline-block text-sm text-accent underline">
          {t("tryReader")}
        </Link>
      </details>
      )}
    </Shell>
  );
}
