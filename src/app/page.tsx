import { count } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import Shell from "@/components/Shell";
import JobsPanel from "@/components/JobsPanel";
import InstallPrompt from "@/components/InstallPrompt";

export const dynamic = "force-dynamic";

async function loadStats() {
  const db = getDb();
  const [[d], [l], [w], hb] = await Promise.all([
    db.select({ n: count() }).from(schema.documents),
    db.select({ n: count() }).from(schema.lessons),
    db.select({ n: count() }).from(schema.words),
    getSetting<number>("worker.heartbeat"),
  ]);
  return { documents: d.n, lessons: l.n, words: w.n, heartbeat: hb ?? 0 };
}

export default async function DashboardPage() {
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
      <p className="mt-2 text-muted">{t("intro")}</p>

      <InstallPrompt />

      <Link
        href="/read/demo"
        className="mt-4 flex min-h-11 items-center rounded-2xl border border-line bg-card px-4 py-3 font-medium text-accent hover:border-accent"
      >
        {t("tryReader")}
      </Link>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
        {(["documents", "lessons", "words"] as const).map((k) => (
          <div key={k} className="rounded-2xl border border-line bg-card p-3 sm:p-4">
            <div className="text-xs text-muted sm:text-sm">{t(`stats.${k}`)}</div>
            <div className="mt-1 text-2xl font-bold sm:text-3xl">{stats ? stats[k] : "–"}</div>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-serif text-xl font-bold">{t("system.title")}</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>✅ {t("system.web")}</li>
          <li>{dbError ? `❌ ${t("system.dbError", { error: dbError })}` : `✅ ${t("system.db")}`}</li>
          <li>
            {workerAlive ? "✅" : "⚠️"}{" "}
            {workerAlive
              ? t("system.workerAlive", { seconds: ago })
              : stats?.heartbeat
                ? t("system.workerLost", { seconds: ago })
                : t("system.workerNever")}
          </li>
        </ul>
      </section>

      <JobsPanel />
    </Shell>
  );
}
