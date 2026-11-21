import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import type { WritingKind } from "@/lib/writing";
import GoalBars from "@/components/GoalBars";
import GoalsEditor from "@/components/GoalsEditor";
import { getGoals, goalProgress, syncAchievements } from "@/lib/goals";
import { progressData, scoreHistory } from "@/lib/stats";
import { Chart } from "@/components/writing/Chart";

export const dynamic = "force-dynamic";

const LEVEL = ["bg-line/60", "bg-accent/25", "bg-accent/50", "bg-accent/75", "bg-accent"];

export default async function ProgressPage() {
  const t = await getTranslations("progress");
  const tw = await getTranslations("writing");
  const [d, goals, targets, hist] = await Promise.all([progressData(), goalProgress(), getGoals(), scoreHistory()]);
  const day = (at: Date) => `${at.getDate()}/${at.getMonth() + 1}`;
  const longest = Math.max(0, ...hist.writing.map((w) => w.pts.length));
  const badges = await syncAchievements({ streak: d.totals.streak, words: d.totals.words, lessons: d.totals.lessonsDone, mastered: d.totals.mastered, xp: d.totals.xp });

  // heat map: 26 weeks × 7 days, ending today
  const byDay = new Map(d.days.map((x) => [x.day, x]));
  const start = new Date(`${d.since}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // back to Monday
  const end = d.days.length ? new Date(`${d.days[d.days.length - 1].day}T00:00:00Z`) : new Date();
  const cells: { day: string; xp: number; reviews: number; minutes: number }[] = [];
  for (const c = new Date(start); c <= new Date(Math.max(end.getTime(), Date.now())); c.setUTCDate(c.getUTCDate() + 1)) {
    const day = c.toISOString().slice(0, 10);
    const a = byDay.get(day);
    cells.push({ day, xp: a?.xp ?? 0, reviews: a?.reviews ?? 0, minutes: a?.minutes ?? 0 });
  }
  const level = (xp: number) => (xp <= 0 ? 0 : xp < 20 ? 1 : xp < 60 ? 2 : xp < 120 ? 3 : 4);
  const last14 = cells.slice(-14);
  const maxRev = Math.max(1, ...last14.map((c) => c.reviews));
  const maxWpm = Math.max(1, ...d.wpm.map((r) => r.wpm));
  const box = "rounded-2xl border border-line bg-card p-4 md:p-5";

  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
        {(["streak", "xp", "lessonsDone", "words", "mastered"] as const).map((k) => (
          <div key={k} className="rounded-2xl border border-line bg-card p-3 sm:p-4">
            <div className="text-xs text-muted sm:text-sm">{t(`totals.${k}`)}</div>
            <div className="mt-1 text-2xl font-bold sm:text-3xl">
              {d.totals[k]}
              {k === "streak" && d.totals.streak > 0 ? " 🔥" : ""}
            </div>
          </div>
        ))}
      </div>

      <section className={`mt-5 ${box}`}>
        <h2 className="font-serif text-xl font-bold">{t("goals")}</h2>
        <div className="mt-3">{goals.length ? <GoalBars goals={goals} /> : <p className="text-sm text-muted">{t("noGoals")}</p>}</div>
        <GoalsEditor targets={targets} />
      </section>

      <section className={`mt-5 ${box}`}>
        <h2 className="font-serif text-xl font-bold">{t("activity")}</h2>
        <div className="no-scrollbar mt-3 overflow-x-auto">
          <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]">
            {cells.map((c) => (
              <div key={c.day} title={t("cell", { day: c.day, xp: c.xp, reviews: c.reviews })} className={`h-3 w-3 rounded-[3px] ${LEVEL[level(c.xp)]}`} />
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">{t("activityHint")}</p>
      </section>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section className={box}>
          <h2 className="font-serif text-xl font-bold">{t("reviews")}</h2>
          <div className="mt-4 flex h-32 items-end gap-1">
            {last14.map((c) => (
              <div key={c.day} className="flex flex-1 flex-col items-center gap-1" title={`${c.day}: ${c.reviews}`}>
                <div className="w-full rounded-t bg-accent" style={{ height: `${(c.reviews / maxRev) * 100}%`, minHeight: c.reviews ? 2 : 0 }} />
                <span className="text-[10px] text-muted">{c.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={box}>
          <h2 className="font-serif text-xl font-bold">{t("speed")}</h2>
          {d.wpm.length ? (
            <>
              <div className="mt-4 flex h-32 items-end gap-1">
                {d.wpm.map((r, i) => (
                  <div key={i} className="flex-1 rounded-t bg-accent2/80" style={{ height: `${(r.wpm / maxWpm) * 100}%` }} title={`${r.wpm} wpm`} />
                ))}
              </div>
              <p className="mt-2 text-sm text-muted">
                {t("speedSummary", { last: d.wpm[d.wpm.length - 1].wpm, avg: Math.round(d.wpm.reduce((a, r) => a + r.wpm, 0) / d.wpm.length) })}
                {d.lookupsPer100 !== null && ` · ${t("lookups", { n: d.lookupsPer100 })}`}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">{t("noReading")}</p>
          )}
        </section>
      </div>

      <section className={`mt-5 ${box}`}>
        <h2 className="font-serif text-xl font-bold">{t("scores")}</h2>
        <p className="text-sm text-muted">{t("scoresHint")}</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {/* x-axis: date of each attempt for single lines; attempt number for writing, where each type has its own count */}
          {hist.reading.length ? (
            <Chart spec={{ type: "line", title: t("chartReading"), unit: "%", max: 100, labels: hist.reading.map((r) => day(r.at)), series: [{ name: t("chartCorrect"), values: hist.reading.map((r) => r.pct) }] }} />
          ) : (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{t("noReadingScores")}</p>
          )}
          {hist.practice.length ? (
            <Chart spec={{ type: "line", title: t("chartWords"), unit: "%", max: 100, labels: hist.practice.map((r) => day(r.at)), series: [{ name: t("chartCorrect"), values: hist.practice.map((r) => r.pct) }] }} />
          ) : (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{t("noWordScores")}</p>
          )}
          {hist.writing.length ? (
            <div className="lg:col-span-2">
              <Chart
                spec={{
                  type: "line",
                  title: t("chartWriting"),
                  unit: "band",
                  max: 9,
                  labels: Array.from({ length: longest }, (_, i) => t("attempt", { n: i + 1 })),
                  series: hist.writing.map((w) => ({ name: tw(`kind.${w.kind as WritingKind}`), values: Array.from({ length: longest }, (_, i) => w.pts[i]?.band ?? null) })),
                }}
              />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted lg:col-span-2">{t("noWritingScores")}</p>
          )}
        </div>
      </section>

      <section className={`mt-5 ${box}`}>
        <h2 className="font-serif text-xl font-bold">{t("accuracy")}</h2>
        {d.accuracy.length ? (
          <ul className="mt-3 space-y-2">
            {d.accuracy.map((a) => (
              <li key={a.qtype} className="text-sm">
                <div className="flex justify-between">
                  <span>{t.has(`qtype.${a.qtype}`) ? t(`qtype.${a.qtype}`) : a.qtype}</span>
                  <span className="text-muted">
                    {a.pct}% · {a.total}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-line/60">
                  <div className={`h-2 rounded-full ${a.pct >= 75 ? "bg-green-500" : a.pct >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${a.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">{t("noAnswers")}</p>
        )}
      </section>
      <section className={`mt-5 ${box}`}>
        <h2 className="font-serif text-xl font-bold">
          {t("badges")} <span className="text-sm font-normal text-muted">{badges.filter((b) => b.unlockedAt).length}/{badges.length}</span>
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {badges.map((b) => (
            <li key={b.code} className={`rounded-xl border p-3 text-center ${b.unlockedAt ? "border-accent bg-accent/5" : "border-line opacity-60"}`} title={b.unlockedAt ? b.unlockedAt.toLocaleDateString() : `${b.progress}/${b.target}`}>
              <div className={`text-2xl ${b.unlockedAt ? "" : "grayscale"}`}>{b.icon}</div>
              <div className="mt-1 text-sm font-medium">{t(`badge.${b.metric}`, { n: b.target })}</div>
              {!b.unlockedAt && (
                <div className="mt-1.5 h-1.5 rounded-full bg-line/60">
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(b.progress / b.target) * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}
