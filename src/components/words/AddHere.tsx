"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import * as I from "@/components/icons";
import { toast } from "@/components/Toaster";

/** A new word straight into this set (or into "other words" when there is no set). */
export default function AddHere({ setId }: { setId?: number }) {
  const t = useTranslations("notebook");
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [meaning, setMeaning] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    setBusy(true);
    const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const r = await fetch("/api/words", json({ term: term.trim(), meaningVi: meaning.trim() || undefined })).catch(() => null);
    const id = r?.ok ? ((await r.json()) as { id: number }).id : null;
    const ok = id && (!setId || (await fetch(`/api/sets/${setId}/items`, json({ wordIds: [id] })).catch(() => null))?.ok);
    setBusy(false);
    if (!ok) return toast(t("failed"), "error");
    setTerm("");
    setMeaning("");
    router.refresh();
  }

  return (
    <form onSubmit={add} className="flex flex-wrap gap-2 rounded-2xl border border-dashed border-line p-2">
      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("newTerm")} maxLength={191} className="field min-w-0 flex-1 basis-32" />
      <input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder={t("newMeaning")} maxLength={500} className="field min-w-0 flex-1 basis-40" />
      <button disabled={busy || !term.trim()} className="btn btn-primary">
        <I.IconPlus /> {t("addWord")}
      </button>
    </form>
  );
}
