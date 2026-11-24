import { getTranslations } from "next-intl/server";
import type { GoalKind } from "@/lib/goals";
import * as I from "@/components/icons";

/** Progress bars for the active goals. */
export default async function GoalBars({ goals }: { goals: { kind: GoalKind; value: number; target: number }[] }) {
  const t = await getTranslations("goals");
  return (
    <ul className="space-y-3">
      {goals.map((g) => {
        const pct = Math.min(100, Math.round((g.value / g.target) * 100));
        return (
          <li key={g.kind} className="text-sm">
            <div className="flex justify-between">
              <span>{t(`kind.${g.kind}`)}</span>
              <span className={pct >= 100 ? "font-semibold text-green-600 dark:text-green-400" : "text-muted"}>
                {pct >= 100 && <I.IconCheck className="mr-0.5 inline-block h-3.5 w-3.5 align-[-0.15em]" />}
                {g.value} / {g.target}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-line/60">
              <div className={`h-2 rounded-full ${pct >= 100 ? "bg-green-500" : "bg-accent"}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
