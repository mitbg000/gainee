import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { recentAttempts } from "@/lib/ielts/queries";
import * as I from "@/components/icons";

type Row = Awaited<ReturnType<typeof recentAttempts>>[number];

/** History rows: mode, test and part, score/band per skill, Writing/overall band, AI notes, time used, date. */
export default async function AttemptList({ rows, tests, sections }: { rows: Row[]; tests: Map<number, string>; sections: Map<number, string> }) {
  const t = await getTranslations("ielts");
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
      {rows.map((a) => {
        const parts = Object.entries(a.scores).map(([k, v]) => `${t(`skill.${k}`)} ${v.score}/${v.total}${a.mode === "mock" ? ` · ${v.band}` : ""}`);
        return (
          <li key={a.id}>
            <Link href={`/ielts/attempts/${a.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm hover:bg-paper">
              <span className={`chip ${a.mode === "mock" ? "chip-on" : ""}`}>{t(`mode.${a.mode}`)}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {tests.get(a.testId) ?? ""}
                {a.sectionId && <span className="font-normal text-muted"> · {sections.get(a.sectionId)}</span>}
                {a.group != null && <span className="font-normal text-muted"> · {t("historyPage.group")}</span>}
              </span>
              <span className="text-muted">{parts.join(" · ") || t(`skill.${a.skill}`)}</span>
              {a.writing > 0 && <span className="text-muted">{t("historyPage.writing", { n: a.writing })}</span>}
              {(a.skill === "writing" || a.skill === "full") && a.band != null && <b className="rounded-full bg-accent/10 px-2 text-accent">{a.skill === "full" ? "Overall" : "Writing"} {a.band}</b>}
              {a.aiNotes > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <I.IconSpark className="h-3.5 w-3.5" />
                  {t("historyPage.aiNotes", { n: a.aiNotes })}
                </span>
              )}
              <span className="text-xs text-muted tabular-nums">
                {Math.round(a.seconds / 60)}′ · {a.createdAt.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
