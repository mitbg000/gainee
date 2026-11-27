"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

type V = "private" | "public" | "groups";

/** Who sees a text besides its owner: nobody, every learner, or the learners of chosen groups. */
export default function ShareDoc({ id, visibility, groupIds, groups }: { id: number; visibility: V; groupIds: number[]; groups: { id: number; name: string }[] }) {
  const t = useTranslations("document.share");
  const [v, setV] = useState<V>(visibility);
  const [g, setG] = useState(groupIds);
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");

  async function save(nv: V, ng: number[]) {
    setV(nv);
    setG(ng);
    setState("saving");
    const r = await fetch(`/api/documents/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ visibility: nv, groupIds: ng }) }).catch(() => null);
    setState(r?.ok ? "saved" : "error");
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{t("title")}</span>
        {(["private", "public", "groups"] as const).map((x) => (
          <button key={x} onClick={() => save(x, g)} aria-pressed={v === x} className={`chip ${v === x ? "chip-on" : ""}`}>
            {t(x)}
          </button>
        ))}
        {state === "saving" && <span className="text-xs text-muted">{t("saving")}</span>}
        {state === "saved" && <span className="text-xs text-green-700 dark:text-green-400">{t("saved")}</span>}
        {state === "error" && <span className="text-xs text-red-600">{t("error")}</span>}
      </div>
      <p className="mt-1 text-xs text-muted">{t(`${v}Hint`)}</p>
      {v === "groups" &&
        (groups.length ? (
          <div className="mt-2 flex flex-wrap gap-3">
            {groups.map((x) => (
              <label key={x.id} className="flex items-center gap-1.5">
                <input type="checkbox" checked={g.includes(x.id)} onChange={(e) => save("groups", e.target.checked ? [...g, x.id] : g.filter((k) => k !== x.id))} />
                {x.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">{t("noGroups")}</p>
        ))}
    </div>
  );
}
