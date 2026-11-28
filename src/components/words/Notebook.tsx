"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import WordCard, { type WordData } from "@/components/WordCard";
import * as I from "@/components/icons";
import { speak } from "@/lib/speech";
import { toast } from "@/components/Toaster";

export type NoteWord = WordData & { state: number; scheduledDays: number; due: string | Date; images: { id: number; url: string }[] };
type SetRef = { id: number; title: string };

const LEARNED_DAYS = 21; // as in lib/review
/** grey new · blue learning · green learned · amber due */
function dot(w: NoteWord) {
  if (!w.state) return "bg-line";
  if (new Date(w.due).getTime() <= Date.now()) return "bg-amber-500";
  return w.state === 2 && w.scheduledDays >= LEARNED_DAYS ? "bg-green-500" : "bg-sky-500";
}

/**
 * The notebook's word list: one line a word (tap to open its full card), and a selection mode to put several
 * words into a set at once – or, for "other words", to move them there.
 */
export default function Notebook({ rows, sets, source }: { rows: NoteWord[]; sets: SetRef[]; source?: string }) {
  const t = useTranslations("notebook");
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const inSet = source?.startsWith("set:") ? Number(source.slice(4)) : null;
  const moving = source === "other";

  const toggle = (id: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const done = (msg: string) => {
    toast(msg);
    setPicked(new Set());
    setPicking(false);
    setDialog(false);
    setTitle("");
    router.refresh();
  };

  async function addTo(setId: number | null) {
    setBusy(true);
    const wordIds = [...picked];
    const r = setId
      ? await fetch(`/api/sets/${setId}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wordIds }) }).catch(() => null)
      : await fetch("/api/sets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim(), wordIds }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return toast(t("failed"), "error");
    done(t(moving ? "moved" : "added", { n: wordIds.length }));
  }
  async function removeFromSet() {
    if (!inSet) return;
    setBusy(true);
    const r = await fetch(`/api/sets/${inSet}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wordIds: [...picked], remove: true }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return toast(t("failed"), "error");
    done(t("removed", { n: picked.size }));
  }

  if (!rows.length) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {picking ? (
          <>
            <button onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))} className="btn btn-sm btn-ghost">
              {picked.size === rows.length ? t("selectNone") : t("selectAll")}
            </button>
            <span className="flex-1 text-sm text-muted">{t("picked", { n: picked.size })}</span>
            <button onClick={() => (setPicking(false), setPicked(new Set()))} className="btn btn-sm btn-ghost">
              {t("cancel")}
            </button>
          </>
        ) : (
          <>
            <span className="flex-1" />
            <button onClick={() => setPicking(true)} className="btn btn-sm btn-ghost">
              <I.IconCheckCircle /> {t(moving ? "selectToMove" : "select")}
            </button>
          </>
        )}
      </div>

      <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
        {rows.map((w) => (
          <li key={w.id}>
            <div className="flex items-center gap-3 px-3 py-2.5">
              {picking ? (
                <input type="checkbox" checked={picked.has(w.id)} onChange={() => toggle(w.id)} className="size-4 flex-none" aria-label={w.term} />
              ) : (
                <span className={`size-2 flex-none rounded-full ${dot(w)}`} title={t(`state.${!w.state ? "new" : new Date(w.due).getTime() <= Date.now() ? "due" : w.state === 2 && w.scheduledDays >= LEARNED_DAYS ? "learned" : "learning"}`)} />
              )}
              <button onClick={() => (picking ? toggle(w.id) : setOpen(open === w.id ? null : w.id))} className="flex min-w-0 flex-1 items-baseline gap-3 text-left">
                <span className="w-28 flex-none truncate font-semibold sm:w-44">{w.term}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{w.meaningVi || w.definitionEn}</span>
              </button>
              <button onClick={() => speak(w.term)} className="icon-btn flex-none" aria-label={t("listen")}>
                <I.IconSpeaker />
              </button>
              {!picking && (
                <button onClick={() => setOpen(open === w.id ? null : w.id)} className="icon-btn flex-none" aria-label={t("more")} aria-expanded={open === w.id}>
                  <I.IconChevronDown className={`transition-transform ${open === w.id ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
            {open === w.id && !picking && (
              <div className="px-3 pb-3">
                <ul>
                  <WordCard word={w} images={w.images} />
                </ul>
                <button
                  onClick={() => {
                    setPicked(new Set([w.id]));
                    setDialog(true);
                  }}
                  className="btn btn-sm btn-ghost mt-2"
                >
                  <I.IconPlus /> {t(moving ? "moveToSet" : "addToSet")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {picking && picked.size > 0 && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-30 mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-3 shadow-lg md:bottom-4">
          <span className="flex-1 text-sm font-semibold">{t("picked", { n: picked.size })}</span>
          {inSet && (
            <button onClick={removeFromSet} disabled={busy} className="btn btn-sm btn-secondary">
              {t("removeFromSet")}
            </button>
          )}
          <button onClick={() => setDialog(true)} disabled={busy} className="btn btn-sm btn-primary">
            <I.IconPlus /> {t(moving ? "moveToSet" : "addToSet")}
          </button>
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setDialog(false)}>
          <div role="dialog" aria-modal="true" aria-label={t(moving ? "moveToSet" : "addToSet")} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-3xl bg-card p-5 shadow-xl">
            <div className="flex items-center">
              <h2 className="flex-1 font-bold">{t(moving ? "moveToSet" : "addToSet")}</h2>
              <button onClick={() => setDialog(false)} className="icon-btn" aria-label={t("cancel")}>
                <I.IconX />
              </button>
            </div>
            <p className="text-sm text-muted">{t("picked", { n: picked.size })}</p>
            {sets.filter((s) => s.id !== inSet).length > 0 && (
              <ul className="space-y-1.5">
                {sets
                  .filter((s) => s.id !== inSet)
                  .map((s) => (
                    <li key={s.id}>
                      <button onClick={() => addTo(s.id)} disabled={busy} className="flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-left hover:border-accent">
                        <I.IconCards className="h-4 w-4 flex-none text-accent" />
                        <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (title.trim()) addTo(null);
              }}
              className="flex gap-2 border-t border-line pt-3"
            >
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("newSetName")} maxLength={191} className="field min-w-0 flex-1" />
              <button disabled={busy || !title.trim()} className="btn btn-primary">
                {t("create")}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
