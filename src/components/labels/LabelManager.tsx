"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LABEL_COLORS } from "@/db/schema";
import type { LabelWithCounts } from "@/lib/labels";
import { DOT, type LabelColor } from "./colors";
import LabelChip from "./LabelChip";

type Kind = "topic" | "source" | "custom";
type Draft = { name: string; emoji: string; color: LabelColor; parentId: number | null; description: string };
const EMPTY: Draft = { name: "", emoji: "", color: "blue", parentId: null, description: "" };
const KINDS: Kind[] = ["topic", "source", "custom"];

export default function LabelManager() {
  const t = useTranslations("labels");
  const [items, setItems] = useState<LabelWithCounts[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/labels", { cache: "no-store" });
    if (r.ok) setItems(await r.json());
    setLoaded(true);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function call(url: string, method: string, body?: unknown) {
    setError("");
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) {
      const code = (await r.json().catch(() => ({}))).error || "unknown";
      setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.unknown"));
      return false;
    }
    await load();
    return true;
  }

  const hasTopics = items.some((l) => l.kind === "topic");

  return (
    <div className="space-y-8">
      {error && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      {KINDS.map((kind) => (
        <Section
          key={kind}
          kind={kind}
          items={items.filter((l) => l.kind === kind)}
          allTopics={items.filter((l) => l.kind === "topic")}
          onCreate={(d) => call("/api/labels", "POST", { kind, ...clean(d) })}
          onUpdate={(id, d) => call(`/api/labels/${id}`, "PATCH", clean(d))}
          onDelete={(id) => call(`/api/labels/${id}`, "DELETE")}
          extra={
            kind === "topic" && loaded && !hasTopics ? (
              <button onClick={() => call("/api/labels", "POST", { preset: "ielts_topics" })} className="min-h-10 rounded-xl border border-dashed border-accent px-3 text-sm text-accent">
                ✨ {t("addIelts")}
              </button>
            ) : null
          }
        />
      ))}
    </div>
  );
}

function clean(d: Draft) {
  return { name: d.name, emoji: d.emoji || null, color: d.color, parentId: d.parentId, description: d.description || null };
}

/** Order topics as a tree: parent, then its children (indented). */
function asTree(items: LabelWithCounts[]) {
  const children = new Map<number | null, LabelWithCounts[]>();
  for (const l of items) {
    const key = l.parentId && items.some((p) => p.id === l.parentId) ? l.parentId : null;
    children.set(key, [...(children.get(key) || []), l]);
  }
  const out: { label: LabelWithCounts; depth: number }[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const l of children.get(parent) || []) {
      out.push({ label: l, depth });
      walk(l.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function Section({
  kind,
  items,
  allTopics,
  onCreate,
  onUpdate,
  onDelete,
  extra,
}: {
  kind: Kind;
  items: LabelWithCounts[];
  allTopics: LabelWithCounts[];
  onCreate: (d: Draft) => Promise<boolean>;
  onUpdate: (id: number, d: Draft) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
  extra: React.ReactNode;
}) {
  const t = useTranslations("labels");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const rows = useMemo(() => (kind === "topic" ? asTree(items) : items.map((label) => ({ label, depth: 0 }))), [items, kind]);

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl font-bold">{t(`kinds.${kind}.title`)}</h2>
          <p className="text-sm text-muted">{t(`kinds.${kind}.hint`)}</p>
        </div>
        <div className="flex gap-2">
          {extra}
          {!adding && (
            <button onClick={() => setAdding(true)} className="min-h-10 rounded-xl bg-accent px-3 text-sm font-medium text-on-accent">
              + {t("add")}
            </button>
          )}
        </div>
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {adding && (
          <li className="p-3">
            <LabelForm
              kind={kind}
              topics={allTopics}
              initial={EMPTY}
              onCancel={() => setAdding(false)}
              onSave={async (d) => (await onCreate(d)) && setAdding(false)}
            />
          </li>
        )}
        {rows.length === 0 && !adding && <li className="p-4 text-sm text-muted">{t("empty")}</li>}
        {rows.map(({ label: l, depth }) => (
          <li key={l.id} className="p-3" style={{ paddingLeft: `${0.75 + depth * 1.5}rem` }}>
            {editing === l.id ? (
              <LabelForm
                kind={kind}
                topics={allTopics.filter((tp) => tp.id !== l.id)}
                initial={{ name: l.name, emoji: l.emoji || "", color: l.color, parentId: l.parentId, description: l.description || "" }}
                onCancel={() => setEditing(null)}
                onSave={async (d) => (await onUpdate(l.id, d)) && setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {depth > 0 && <span className="text-muted" aria-hidden>↳</span>}
                <LabelChip name={l.name} emoji={l.emoji} color={l.color} />
                <span className="text-xs text-muted">{t("counts", { documents: l.documents, words: l.words })}</span>
                {l.description && <span className="w-full text-sm text-muted sm:w-auto">{l.description}</span>}
                <span className="ml-auto flex gap-1">
                  <button onClick={() => setEditing(l.id)} className="min-h-9 rounded-lg px-2.5 text-sm text-muted hover:bg-paper hover:text-ink">
                    {t("edit")}
                  </button>
                  <button
                    onClick={() => confirm(t("confirmDelete", { name: l.name })) && onDelete(l.id)}
                    className="min-h-9 rounded-lg px-2.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    {t("delete")}
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LabelForm({
  kind,
  topics,
  initial,
  onSave,
  onCancel,
}: {
  kind: Kind;
  topics: LabelWithCounts[];
  initial: Draft;
  onSave: (d: Draft) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("labels");
  const [d, setD] = useState<Draft>(initial);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (d.name.trim()) onSave(d);
      }}
      className="space-y-3"
    >
      <div className="flex gap-2">
        <input
          aria-label={t("emoji")}
          placeholder="🙂"
          value={d.emoji}
          maxLength={8}
          onChange={(e) => set({ emoji: e.target.value })}
          className="w-14 rounded-lg border border-line bg-paper px-2 py-2 text-center text-base"
        />
        <input
          autoFocus
          aria-label={t("name")}
          placeholder={t(`kinds.${kind}.placeholder`)}
          value={d.name}
          maxLength={100}
          onChange={(e) => set({ name: e.target.value })}
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-base"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t("color")}>
        {LABEL_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={d.color === c}
            aria-label={c}
            onClick={() => set({ color: c })}
            className={`h-7 w-7 rounded-full ${DOT[c]} ${d.color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-card" : ""}`}
          />
        ))}
      </div>
      {kind === "topic" && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{t("parent")}</span>
          <select
            value={d.parentId ?? ""}
            onChange={(e) => set({ parentId: e.target.value ? Number(e.target.value) : null })}
            className="rounded-lg border border-line bg-paper px-2 py-1.5"
          >
            <option value="">{t("noParent")}</option>
            {topics.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.emoji ? `${tp.emoji} ` : ""}
                {tp.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <input
        placeholder={t("description")}
        value={d.description}
        maxLength={500}
        onChange={(e) => set({ description: e.target.value })}
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <button className="min-h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent">{t("save")}</button>
        <button type="button" onClick={onCancel} className="min-h-10 rounded-xl px-3 text-sm text-muted hover:text-ink">
          {t("cancel")}
        </button>
        {d.name && <LabelChip name={d.name} emoji={d.emoji} color={d.color} className="ml-auto" />}
      </div>
    </form>
  );
}
