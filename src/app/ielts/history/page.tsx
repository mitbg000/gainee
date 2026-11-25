import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import AttemptList from "@/components/ielts/AttemptList";
import { listBooks, recentAttempts } from "@/lib/ielts/queries";

export const dynamic = "force-dynamic";

/** Every mock test and practice round; each opens with its answers, marks, bands and saved AI feedback. */
export default async function IeltsHistoryPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const t = await getTranslations("ielts");
  const mode = (await searchParams).mode;
  const [books, all] = await Promise.all([listBooks(), recentAttempts(500)]);
  const tests = new Map(books.flatMap((b) => b.tests.map((x) => [x.id, `${b.title} · ${x.title}`] as const)));
  const sections = new Map(books.flatMap((b) => b.tests.flatMap((x) => x.sections.map((s) => [s.id, `${s.skill === "listening" ? "Listening" : s.skill === "reading" ? "Reading" : "Writing"} ${s.part}`] as const))));
  const rows = mode === "mock" || mode === "practice" ? all.filter((a) => a.mode === mode) : all;
  return (
    <Shell wide>
      <Link href="/ielts" className="text-sm text-muted hover:underline">
        ← {t("title")}
      </Link>
      <h1 className="mt-1 font-serif text-3xl font-bold">{t("historyPage.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("historyPage.intro")}</p>
      <div className="mt-4 mb-3 flex gap-1.5">
        {[undefined, "mock", "practice"].map((m) => (
          <Link key={m ?? "all"} href={m ? `/ielts/history?mode=${m}` : "/ielts/history"} className={`chip ${mode === m ? "chip-on" : ""}`}>
            {m ? t(`mode.${m}`) : t("historyPage.filterAll")}
          </Link>
        ))}
      </div>
      {rows.length ? <AttemptList rows={rows} tests={tests} sections={sections} /> : <p className="text-muted">{t("historyPage.empty")}</p>}
    </Shell>
  );
}
