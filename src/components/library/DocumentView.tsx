"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { DocumentDetail } from "@/lib/documents/queries";
import LabelChip from "@/components/labels/LabelChip";
import LabelPicker from "@/components/labels/LabelPicker";
import * as I from "@/components/icons";

type Info = { title: string; author: string; source: string; level: string; lessons: Record<number, { title: string; titleVi: string }> };

export default function DocumentView({ initial }: { initial: DocumentDetail }) {
  const t = useTranslations("document");
  const router = useRouter();
  const [doc, setDoc] = useState(initial);
  const [editLabels, setEditLabels] = useState(false);
  const [labelIds, setLabelIds] = useState(initial.labels.map((l) => l.id));
  const [info, setInfo] = useState<Info | null>(null); // the edit form, when open
  const [saving, setSaving] = useState(false);

  function openInfo() {
    setInfo({
      title: doc.title,
      author: doc.author ?? "",
      source: doc.source ?? "",
      level: doc.level ?? "",
      lessons: Object.fromEntries(doc.lessons.map((l) => [l.id, { title: l.title, titleVi: l.titleVi ?? "" }])),
    });
  }
  async function saveInfo() {
    if (!info || !info.title.trim()) return;
    setSaving(true);
    const json = { method: "PATCH", headers: { "content-type": "application/json" } };
    const changed = doc.lessons.filter((l) => info.lessons[l.id] && (info.lessons[l.id].title.trim() !== l.title || info.lessons[l.id].titleVi.trim() !== (l.titleVi ?? "")));
    await Promise.all(
      changed.map((l) => fetch(`/api/lessons/${l.id}`, { ...json, body: JSON.stringify({ title: info.lessons[l.id].title.trim() || l.title, titleVi: info.lessons[l.id].titleVi.trim() || null }) })),
    );
    await patch({ title: info.title.trim(), author: info.author.trim() || null, source: info.source.trim() || null, level: info.level || null });
    setSaving(false);
    setInfo(null);
    router.refresh(); // sidebar tree and library list show the new names
  }

  const reload = useCallback(async () => {
    const r = await fetch(`/api/documents/${doc.id}`, { cache: "no-store" });
    if (r.ok) setDoc(await r.json());
  }, [doc.id]);

  const busy = doc.status === "processing" || doc.job?.status === "queued" || doc.job?.status === "running";
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(reload, 2500);
    return () => clearInterval(id);
  }, [busy, reload]);

  async function patch(body: Record<string, unknown>) {
    const r = await fetch(`/api/documents/${doc.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) setDoc(await r.json());
  }
  async function regen(lessonIds?: number[]) {
    await fetch(`/api/documents/${doc.id}/regenerate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lessonIds }) });
    reload();
  }

  const ready = doc.lessons.filter((l) => l.status === "ready").length;
  const failed = doc.lessons.filter((l) => l.status === "error");
  const suggestions = doc.meta?.suggestedTopics?.length || doc.meta?.suggestedSource;
  const firstOpen = doc.lessons.find((l) => l.status === "ready" && !l.completedAt) ?? doc.lessons.find((l) => l.status === "ready");

  return (
    <div>
      <Link href="/library" className="text-sm text-muted hover:text-ink">
        ← {t("back")}
      </Link>
      <div className="mt-2 flex items-start gap-2">
        <h1 className="flex-1 font-serif text-3xl font-bold leading-tight md:text-4xl">{doc.title}</h1>
        {!info && (
          <button onClick={openInfo} className="btn btn-sm btn-secondary mt-1">
            <I.IconEdit /> {t("editInfo")}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        {[doc.author, doc.source, doc.level, t("words", { n: doc.wordCount })].filter(Boolean).join(" · ")}
      </p>

      {info && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveInfo();
          }}
          className="mt-4 space-y-4 rounded-2xl border border-line bg-card p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="text-muted">{t("fTitle")}</span>
              <input className="field mt-1 w-full" value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })} required maxLength={500} />
            </label>
            <label className="text-sm">
              <span className="text-muted">{t("fAuthor")}</span>
              <input className="field mt-1 w-full" value={info.author} onChange={(e) => setInfo({ ...info, author: e.target.value })} maxLength={255} />
            </label>
            <label className="text-sm">
              <span className="text-muted">{t("fLevel")}</span>
              <select className="field mt-1 w-full" value={info.level} onChange={(e) => setInfo({ ...info, level: e.target.value })}>
                <option value="">—</option>
                {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-muted">{t("fSource")}</span>
              <input className="field mt-1 w-full" value={info.source} onChange={(e) => setInfo({ ...info, source: e.target.value })} maxLength={1000} placeholder={t("fSourceHint")} />
            </label>
          </div>
          {doc.lessons.length > 0 && (
            <div>
              <p className="text-sm font-semibold">{t("fLessons")}</p>
              <ol className="mt-2 space-y-2">
                {doc.lessons.map((l) => (
                  <li key={l.id} className="grid gap-2 sm:grid-cols-[2rem_1fr_1fr] sm:items-center">
                    <span className="text-sm text-muted">{l.position}</span>
                    <input
                      className="field-sm w-full"
                      value={info.lessons[l.id].title}
                      onChange={(e) => setInfo({ ...info, lessons: { ...info.lessons, [l.id]: { ...info.lessons[l.id], title: e.target.value } } })}
                      aria-label={t("fLessonTitle", { n: l.position })}
                      maxLength={500}
                    />
                    <input
                      className="field-sm w-full"
                      value={info.lessons[l.id].titleVi}
                      onChange={(e) => setInfo({ ...info, lessons: { ...info.lessons, [l.id]: { ...info.lessons[l.id], titleVi: e.target.value } } })}
                      aria-label={t("fLessonTitleVi", { n: l.position })}
                      placeholder={t("fLessonTitleVi", { n: l.position })}
                      maxLength={500}
                    />
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="flex gap-2">
            <button disabled={saving || !info.title.trim()} className="btn btn-primary">
              {saving ? t("saving") : t("save")}
            </button>
            <button type="button" onClick={() => setInfo(null)} className="btn btn-ghost">
              {t("cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {doc.labels.map((l) => (
          <LabelChip key={l.id} name={l.name} emoji={l.emoji} color={l.color} />
        ))}
        <button onClick={() => setEditLabels(!editLabels)} className="min-h-8 rounded-full border border-dashed border-line px-3 text-sm text-muted hover:text-ink">
          {doc.labels.length ? t("editLabels") : `+ ${t("addLabels")}`}
        </button>
      </div>
      {editLabels && (
        <div className="mt-3 rounded-2xl border border-line bg-card p-4">
          <LabelPicker value={labelIds} onChange={setLabelIds} />
          <div className="mt-3 flex gap-2">
            <button
              onClick={async () => {
                await patch({ labelIds });
                setEditLabels(false);
                router.refresh();
              }}
              className="min-h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent"
            >
              {t("save")}
            </button>
            <button onClick={() => setEditLabels(false)} className="min-h-10 px-3 text-sm text-muted">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {suggestions ? (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm">
          <p className="font-medium"><I.IconSpark className="inline-block h-4 w-4 align-[-0.2em]" /> {t("suggestTitle")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {doc.meta?.suggestedTopics?.map((s) => (
              <span key={s} className="rounded-full border border-line bg-card px-3 py-0.5">
                {s}
              </span>
            ))}
            {doc.meta?.suggestedSource && <span className="rounded-full border border-line bg-card px-3 py-0.5">📰 {doc.meta.suggestedSource}</span>}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => patch({ acceptSuggestions: { topics: doc.meta?.suggestedTopics ?? [], source: doc.meta?.suggestedSource ?? null } }).then(() => setLabelIds([]))}
              className="min-h-10 rounded-xl bg-accent px-4 font-medium text-on-accent"
            >
              {t("accept")}
            </button>
            <button onClick={() => patch({ dismissSuggestions: true })} className="min-h-10 px-3 text-muted">
              {t("dismiss")}
            </button>
          </div>
        </div>
      ) : null}

      {doc.meta?.summary && <p className="mt-4 rounded-2xl border-l-4 border-accent2 bg-card p-4 text-[15px] leading-relaxed">{doc.meta.summary}</p>}

      {busy && (
        <div className="mt-5 rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{t("generating")}</span>
            <span className="text-muted">
              {ready}/{doc.lessons.length}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(ready / Math.max(1, doc.lessons.length)) * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">{t("generatingHint")}</p>
        </div>
      )}

      {firstOpen && (
        <Link href={`/lessons/${firstOpen.id}`} className="btn btn-lg btn-primary mt-5 w-full sm:w-auto">
          {doc.lessons.some((l) => l.completedAt) ? t("continue", { n: firstOpen.position }) : t("start")} →
        </Link>
      )}

      <h2 className="mt-8 font-serif text-xl font-bold">{t("lessons")}</h2>
      <ol className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {doc.lessons.map((l) => {
          const inner = (
            <div className="flex items-center gap-3 p-3.5">
              <span
                className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-semibold ${
                  l.completedAt ? "bg-green-600 text-white" : "bg-paper text-muted"
                }`}
              >
                {l.completedAt ? "✓" : l.position}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{l.status === "ready" ? l.title : t("part", { n: l.position })}</div>
                <div className="truncate text-xs text-muted">
                  {l.status === "ready" ? (
                    [l.titleVi, t("words", { n: l.wordCount }), l.bestScore != null ? t("score", { n: l.bestScore }) : null].filter(Boolean).join(" · ")
                  ) : l.status === "error" ? (
                    <span className="text-red-600 dark:text-red-400">{t("lessonFailed")}</span>
                  ) : (
                    t(`status.${l.status}`)
                  )}
                </div>
              </div>
              {l.status === "error" && !busy && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    regen([l.id]);
                  }}
                  className="btn btn-sm btn-secondary"
                >
                  {t("retry")}
                </button>
              )}
              {l.status === "generating" && <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
            </div>
          );
          return <li key={l.id}>{l.status === "ready" ? <Link href={`/lessons/${l.id}`} className="block hover:bg-paper">{inner}</Link> : inner}</li>;
        })}
      </ol>

      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        {failed.length > 1 && !busy && (
          <button onClick={() => regen(failed.map((l) => l.id))} className="btn btn-secondary">
            {t("retryAll", { n: failed.length })}
          </button>
        )}
        <button
          onClick={async () => {
            if (!confirm(t("confirmDelete"))) return;
            await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
            router.push("/library");
            router.refresh();
          }}
          className="min-h-10 rounded-xl px-3 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
        >
          {t("delete")}
        </button>
      </div>
      {doc.error && !busy && <p className="mt-3 text-sm text-muted">{doc.error}</p>}
    </div>
  );
}
