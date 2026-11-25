"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import * as I from "@/components/icons";

/**
 * A name with an edit (pencil) button: book, test or section. Saves { title } to `url` with `method`;
 * an empty name is allowed only where `allowEmpty` (a section falls back to "Listening Part 1"…).
 */
export function InlineRename({ url, method = "PATCH", title, placeholder, allowEmpty = false, className = "", inputClass = "" }: { url: string; method?: "PATCH" | "PUT"; title: string; placeholder?: string; allowEmpty?: boolean; className?: string; inputClass?: string }) {
  const t = useTranslations("ielts.book");
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if ((!v && !allowEmpty) || v === title) return setEdit(false);
    setBusy(true);
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ title: v || null }) });
    setBusy(false);
    if (r.ok) {
      setEdit(false);
      router.refresh();
    }
  }

  if (!edit)
    return (
      <span className={`group inline-flex min-w-0 items-center gap-1 ${className}`}>
        <span className="truncate">{title || placeholder}</span>
        <button type="button" onClick={() => (setValue(title), setEdit(true))} className="icon-btn size-7 flex-none opacity-60 group-hover:opacity-100" aria-label={t("rename")} title={t("rename")}>
          <I.IconEdit className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  return (
    <form onSubmit={save} className={`flex min-w-0 flex-1 flex-wrap items-center gap-1.5 ${className}`}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEdit(false)}
        autoFocus
        onFocus={(e) => e.target.select()}
        maxLength={191}
        placeholder={placeholder}
        className={`field field-sm min-w-40 flex-1 ${inputClass}`}
        aria-label={t("rename")}
      />
      <button disabled={busy || (!allowEmpty && !value.trim())} className="btn btn-sm btn-primary" aria-label={t("save")}>
        <I.IconCheck />
      </button>
      <button type="button" onClick={() => setEdit(false)} className="btn btn-sm btn-ghost" aria-label={t("cancel")}>
        <I.IconX />
      </button>
    </form>
  );
}

/** Book name at the top of the book page. */
export default function BookTitle({ id, title }: { id: number; title: string }) {
  return <InlineRename url={`/api/ielts/books/${id}`} title={title} className="mt-1 font-serif text-3xl font-bold" inputClass="font-serif text-xl font-bold" />;
}
