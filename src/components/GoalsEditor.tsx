"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Edit goal targets (0 = off). */
export default function GoalsEditor({ targets }: { targets: Record<string, number> }) {
  const t = useTranslations("goals");
  const router = useRouter();
  const [v, setV] = useState(targets);
  const [state, setState] = useState<"" | "saving" | "saved">("");
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm text-accent">{t("edit")}</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {Object.keys(targets).map((k) => (
          <label key={k} className="text-xs text-muted">
            {t(`kind.${k}`)}
            <input
              type="number"
              min={0}
              max={1000}
              value={v[k]}
              onChange={(e) => (setV({ ...v, [k]: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) }), setState(""))}
              className="w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">{t("offHint")}</p>
      <button
        onClick={async () => {
          setState("saving");
          await fetch("/api/goals", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
          setState("saved");
          router.refresh();
        }}
        className="mt-2 min-h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent"
      >
        {state === "saved" ? `✓ ${t("saved")}` : t("save")}
      </button>
    </details>
  );
}
