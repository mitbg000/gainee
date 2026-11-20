"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { speak } from "@/lib/speech";
import * as I from "@/components/icons";

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
type Img = { id: number; url: string };

export default function WordCard({ word, images }: { word: WordData; images: Img[] }) {
  const t = useTranslations("wordList");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [imgError, setImgError] = useState(false);

  async function addImages(files: File[]) {
    setImgError(false);
    for (const f of files.filter((x) => x.type.startsWith("image/"))) {
      const fd = new FormData();
      fd.set("file", f);
      const r = await fetch(`/api/words/${word.id}/images`, { method: "POST", body: fd }).catch(() => null);
      if (!r?.ok) setImgError(true);
    }
    router.refresh();
  }
  async function removeImage(mediaId: number) {
    await fetch(`/api/words/${word.id}/images/${mediaId}`, { method: "DELETE" });
    router.refresh();
  }

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
        <div
          className="mt-3 rounded-xl border border-dashed border-line p-3"
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              addImages(files);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addImages([...e.dataTransfer.files]);
          }}
          tabIndex={0}
        >
          <div className="text-xs text-muted">{t("images")}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {images.map((im) => (
              <div key={im.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                <button onClick={() => removeImage(im.id)} aria-label={t("removeImage")} className="absolute -right-1.5 -top-1.5 h-6 w-6 rounded-full bg-ink text-xs text-paper">
                  <I.IconClose className="inline-block h-4 w-4 align-[-0.2em]" />
                </button>
              </div>
            ))}
            <label className="flex h-20 w-20 items-center justify-center rounded-lg border border-line text-2xl text-muted hover:border-accent">
              +
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple className="hidden" onChange={(e) => (addImages([...(e.target.files ?? [])]), (e.target.value = ""))} />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted">{t("imagesHint")}</p>
          {imgError && <p className="mt-1 text-xs text-red-600">{t("imageFailed")}</p>}
        </div>
        <div className="mt-3 flex gap-2">
          <button disabled={busy || !form.term?.trim()} onClick={save} className="btn btn-primary">
            {t("save")}
          </button>
          <button onClick={() => setEditing(false)} className="btn btn-secondary">
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
        {word.example && <div className="mt-1 text-sm italic"><I.IconQuote className="inline-block h-4 w-4 align-[-0.2em] text-muted" /> {word.example}</div>}
        {word.context && <div className="mt-1 text-sm italic text-muted">“{word.context}”</div>}
        {word.note && <div className="mt-1 text-sm text-muted"><I.IconBulb className="inline-block h-4 w-4 align-[-0.2em]" /> {word.note}</div>}
        {images.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {images.map((im) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={im.id} src={im.url} alt={word.term} loading="lazy" className="h-24 max-w-[10rem] rounded-lg object-cover" />
            ))}
          </div>
        )}
        {!word.meaningVi && !word.ipa && <button onClick={start} className="mt-1 text-sm text-accent underline">{t("addDetails")}</button>}
      </div>
      <div className="flex flex-none gap-1">
        <button onClick={() => speak(word.term)} className="icon-btn icon-btn-outline" aria-label={t("listen")}>
          <I.IconSpeaker className="inline-block h-4 w-4 align-[-0.2em]" />
        </button>
        <button onClick={start} className="icon-btn icon-btn-outline">
          <I.IconEdit className="inline-block h-4 w-4 align-[-0.2em]" />
        </button>
        <button onClick={remove} className="icon-btn icon-btn-outline" aria-label={t("remove")}>
          <I.IconTrash className="inline-block h-4 w-4 align-[-0.2em]" />
        </button>
      </div>
    </li>
  );
}
