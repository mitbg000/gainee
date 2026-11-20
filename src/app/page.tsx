import { count } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import Shell from "@/components/Shell";
import JobsPanel from "@/components/JobsPanel";

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
      <h1 className="mt-1 font-serif text-4xl font-bold">{t("greeting")}</h1>
      <p className="mt-2 text-gray-600">{t("intro")}</p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(["documents", "lessons", "words"] as const).map((k) => (
          <div key={k} className="rounded-2xl border border-line bg-white p-4">
            <div className="text-sm text-gray-500">{t(`stats.${k}`)}</div>
            <div className="mt-1 text-3xl font-bold">{stats ? stats[k] : "–"}</div>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-line bg-white p-5">
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
