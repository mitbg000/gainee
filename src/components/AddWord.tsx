"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

const input = "w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm outline-none focus:border-accent";

/** Add a word by hand (not tied to a lesson). */
export default function AddWord() {
  const t = useTranslations("wordList");
  const router = useRouter();
  const [f, setF] = useState({ term: "", ipa: "", pos: "", meaningVi: "" });
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    const r = await fetch("/api/words", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setF({ term: "", ipa: "", pos: "", meaningVi: "" });
      router.refresh();
    }
  }

  return (
    <details className="mt-4 rounded-2xl border border-line bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">+ {t("add")}</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(["term", "ipa", "pos", "meaningVi"] as const).map((k) => (
          <label key={k} className="text-xs text-muted">
            {t(`field.${k}`)}
            <input className={input} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} maxLength={k === "pos" ? 32 : 191} />
          </label>
        ))}
      </div>
      <button disabled={busy || !f.term.trim()} onClick={add} className="btn btn-primary mt-3">
        {t("save")}
      </button>
    </details>
  );
}
