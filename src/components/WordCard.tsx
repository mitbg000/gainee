"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { speak } from "@/lib/speech";

export type WordData = {
  id: number;
  term: string;
  ipa: string | null;
  pos: string | null;
  meaningVi: string | null;
  definitionEn: string | null;
  example: string | null;
  note: string | null;
  context: string | null;
};

const FIELDS = ["term", "ipa", "pos", "meaningVi", "definitionEn", "example", "note", "context"] as const;
const input = "w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm outline-none focus:border-accent";

/** One saved word: view, edit in place, listen, delete. */
export default function WordCard({ word }: { word: WordData }) {
  const t = useTranslations("wordList");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const start = () => {
    setForm(Object.fromEntries(FIELDS.map((k) => [k, word[k] ?? ""])));
    setEditing(true);
  };
  async function save() {
    if (!form.term?.trim()) return;
    setBusy(true);
    const r = await fetch(`/api/words/${word.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setEditing(false);
      router.refresh();
    }
  }
  async function remove() {
    if (!confirm(t("deleteConfirm", { term: word.term }))) return;
    await fetch(`/api/words/${word.id}`, { method: "DELETE" });
    router.refresh();
  }

  if (editing)
    return (
      <li className="rounded-2xl border border-accent bg-card p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {FIELDS.map((k) => (
            <label key={k} className={`text-xs text-muted ${["definitionEn", "example", "note", "context"].includes(k) ? "sm:col-span-2" : ""}`}>
              {t(`field.${k}`)}
              {["definitionEn", "example", "note", "context"].includes(k) ? (
                <textarea rows={2} className={input} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              ) : (
                <input className={input} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} maxLength={k === "pos" ? 32 : 191} />
              )}
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button disabled={busy || !form.term?.trim()} onClick={save} className="min-h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-50">
            {t("save")}
          </button>
          <button onClick={() => setEditing(false)} className="min-h-10 rounded-xl border border-line px-4 text-sm">
            {t("cancel")}
          </button>
        </div>
      </li>
    );

  return (
    <li className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-serif text-xl font-bold">{word.term}</span>
          {word.pos && <span className="text-sm font-semibold text-accent2">{word.pos}</span>}
          {word.ipa && <span className="text-sm text-muted">{word.ipa}</span>}
        </div>
        {word.meaningVi && <div className="text-accent">{word.meaningVi}</div>}
        {word.definitionEn && <div className="text-sm text-muted">{word.definitionEn}</div>}
        {word.example && <div className="mt-1 text-sm italic">✎ {word.example}</div>}
        {word.context && <div className="mt-1 text-sm italic text-muted">“{word.context}”</div>}
        {word.note && <div className="mt-1 text-sm text-muted">💡 {word.note}</div>}
        {!word.meaningVi && !word.ipa && <button onClick={start} className="mt-1 text-sm text-accent underline">{t("addDetails")}</button>}
      </div>
      <div className="flex flex-none gap-1">
        <button onClick={() => speak(word.term)} className="min-h-9 rounded-lg border border-line px-2" aria-label={t("listen")}>
          🔊
        </button>
        <button onClick={start} className="min-h-9 rounded-lg border border-line px-2.5 text-sm">
          ✎
        </button>
        <button onClick={remove} className="min-h-9 rounded-lg border border-line px-2.5 text-sm text-muted hover:text-ink" aria-label={t("remove")}>
          🗑
        </button>
      </div>
    </li>
  );
}
