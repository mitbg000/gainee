"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import * as I from "@/components/icons";
import { clean, removeWords } from "@/lib/listen/clean";
import type { Media } from "@/lib/listen/queries";
import { useClipPlayer } from "./useClipPlayer";

type Row = { key: number; id?: number; start: number; end: number; text: string; speaker: string | null; hidden: boolean; confidence: number | null };
const json = (body: unknown) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const r2 = (n: number) => Math.round(n * 100) / 100;
const LOW = 0.7;
type Heard = { w: string; s: number; e: number }[];
const norm = (w: string) => w.toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}']/gu, "");
/** Whisper's words inside a sentence's time (the middle of the word inside it). */
const heardIn = (heard: Heard, from: number, to: number) => heard.filter((w) => (w.s + w.e) / 2 >= from && (w.s + w.e) / 2 < to).map((w) => w.w);

/**
 * Review of a recording's sentences before practice: listen to each cut, fix words, move start / end by 0.25 s,
 * join or split sentences. Cuts Whisper was unsure of (IELTS) are marked and can be shown alone.
 */
export default function ListenEditor({ sourceId, title: title0, shift: shift0, media, rows: rows0, captions, heard }: { sourceId: number; title: string; shift: number; media: Media; rows: Omit<Row, "key">[]; captions: string; /** what Whisper heard (IELTS), times in the file */ heard: Heard | null }) {
  const t = useTranslations("listen.edit");
  const router = useRouter();
  const player = useClipPlayer();
  const nextKey = useRef(rows0.length);
  const [rows, setRows] = useState<Row[]>(() => rows0.map((r, key) => ({ ...r, key })));
  const [title, setTitle] = useState(title0);
  const [shift, setShift] = useState(shift0);
  const [onlyLow, setOnlyLow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const boxes = useRef(new Map<number, HTMLTextAreaElement>());
  const [undo, setUndo] = useState<Row[] | null>(null);
  const [cleaned, setCleaned] = useState<string | null>(null);

  const [aiBusy, setAiBusy] = useState(false);
  /** Same as tidyUp, by AI: it joins lines by meaning and names speakers; the server checks it changed no spoken word. */
  async function tidyUpAi() {
    setAiBusy(true);
    setCleaned(t("aiWorking"));
    const r = await fetch("/api/listen/clean-ai", { method: "POST", ...json({ rows: rows.map((x, i) => ({ i, start: x.start, end: x.end, text: x.text, speaker: x.speaker, hidden: x.hidden, ...(heard ? { heard: heardIn(heard, x.start + shift, x.end + shift).join(" ") } : {}) })) }) }).catch(() => null);
    setAiBusy(false);
    if (!r?.ok) return setCleaned(t("aiFailed"));
    const j: { rows: { i: number; start: number; end: number; text: string; speaker: string | null; hidden: boolean }[]; fallback: number; fixed: number } = await r.json();
    setUndo(rows);
    // each result is the first of the lines it joined: it keeps that line's id (and practice history)
    setRows(j.rows.map((x) => ({ ...rows[x.i], start: x.start, end: x.end, text: x.text, speaker: x.speaker, hidden: x.hidden })));
    setDirty(true);
    setCleaned(t("aiCleaned", { before: rows.length, after: j.rows.length, fixed: j.fixed, fallback: j.fallback }));
  }

  const [strike, setStrike] = useState("");
  /** Take the words typed (comma-separated, e.g. names stuck in the lines) out of every sentence. */
  function strikeWords() {
    const r = removeWords(rows, strike.split(","));
    setUndo(rows);
    setRows(r.rows);
    setDirty(true);
    setCleaned(t("struck", { n: r.removed }));
  }

  function tidyUp() {
    const r = clean(rows);
    setUndo(rows);
    setRows(r.rows);
    setDirty(true);
    setCleaned(t("cleaned", r.report));
  }

  useEffect(() => {
    if (media.kind === "youtube") player.cueVideo(media.youtubeId, rows0[0]?.start ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (key: number, patch: Partial<Row>) => {
    setDirty(true);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const listen = (r: Row) => player.play({ media: { ...media, shift }, start: r.start, end: r.end });

  function join(k: number) {
    setDirty(true);
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === k);
      const a = rs[i];
      const b = rs[i + 1];
      if (!b) return rs;
      return [...rs.slice(0, i), { ...a, end: b.end, text: `${a.text} ${b.text}`, confidence: a.confidence === null || b.confidence === null ? null : Math.min(a.confidence, b.confidence) }, ...rs.slice(i + 2)];
    });
  }
  /** Split at the cursor in the text; the time is shared by the length of the two parts. */
  function split(k: number) {
    const at = boxes.current.get(k)?.selectionStart;
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === k);
      const r = rs[i];
      if (!at || at <= 0 || at >= r.text.length) return rs;
      const a = r.text.slice(0, at).trim();
      const b = r.text.slice(at).trim();
      if (!a || !b) return rs;
      setDirty(true);
      const mid = r2(r.start + ((r.end - r.start) * a.length) / (a.length + b.length));
      return [...rs.slice(0, i), { ...r, end: mid, text: a }, { ...r, key: nextKey.current++, id: undefined, start: mid, text: b }, ...rs.slice(i + 1)];
    });
  }

  async function save(reviewed: boolean) {
    setSaving(true);
    const a = await fetch(`/api/listen/sources/${sourceId}/items`, { method: "PUT", ...json({ items: rows.map(({ id, start, end, text, speaker, hidden }) => ({ id, start, end, text, speaker, hidden })) }) });
    const b = await fetch(`/api/listen/sources/${sourceId}`, { method: "PATCH", ...json({ title: title.trim() || title0, shift, ...(reviewed ? { reviewed: true } : {}) }) });
    setSaving(false);
    if (!a.ok || !b.ok) return alert(t("saveFailed"));
    setDirty(false);
    router.push(reviewed ? `/listen/${sourceId}` : `/listen/${sourceId}/edit`);
    router.refresh();
  }

  const low = rows.filter((r) => r.confidence !== null && r.confidence < LOW).length;
  const list = onlyLow ? rows.filter((r) => r.confidence !== null && r.confidence < LOW) : rows;
  const nudge = (label: string, on: () => void) => (
    <button onClick={on} className="min-h-7 rounded border border-line px-1.5 font-mono text-xs hover:bg-paper">
      {label}
    </button>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
      <div className="space-y-3 lg:sticky lg:top-20">
        <div ref={player.videoBox} className={`aspect-video w-full overflow-hidden rounded-2xl bg-black ${media.kind === "youtube" ? "" : "hidden"}`} />
        <div className="space-y-3 rounded-2xl border border-line bg-card p-4 text-sm">
          <label className="block">
            <span className="font-semibold">{t("title")}</span>
            <input value={title} onChange={(e) => (setTitle(e.target.value), setDirty(true))} className="field mt-1 w-full" />
          </label>
          <label className="block">
            <span className="font-semibold">{t("shift")}</span>
            <span className="mt-1 flex items-center gap-2">
              {nudge("−0.25", () => (setShift((s) => r2(s - 0.25)), setDirty(true)))}
              <span className="w-14 text-center font-mono">{shift > 0 ? "+" : ""}{shift.toFixed(2)}s</span>
              {nudge("+0.25", () => (setShift((s) => r2(s + 0.25)), setDirty(true)))}
            </span>
            <span className="mt-1 block text-xs text-muted">{t("shiftHint")}</span>
          </label>
          {captions === "auto" && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{t("autoCaptions")}</p>}
          {low > 0 && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> {t("onlyLow", { n: low })}
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={tidyUp} className="btn btn-sm btn-secondary" title={t("cleanHint")}>
              <I.IconChecklist /> {t("clean")}
            </button>
            <button onClick={tidyUpAi} disabled={aiBusy} className="btn btn-sm btn-secondary" title={t("aiCleanHint")}>
              <I.IconSpark /> {aiBusy ? t("aiWorking") : t("aiClean")}
            </button>
            {undo && (
              <button onClick={() => (setRows(undo), setUndo(null), setCleaned(null))} className="btn btn-sm btn-ghost">
                <I.IconUndo /> {t("undo")}
              </button>
            )}
          </div>
          <form onSubmit={(e) => (e.preventDefault(), strikeWords())} className="flex gap-2">
            <input value={strike} onChange={(e) => setStrike(e.target.value)} placeholder={t("strikePlaceholder")} aria-label={t("strikePlaceholder")} className="field field-sm min-w-0 flex-1" />
            <button disabled={!strike.trim()} className="btn btn-sm btn-secondary" title={t("strikeHint")}>
              {t("strike")}
            </button>
          </form>
          {cleaned && <p className="text-xs text-muted">{cleaned}</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => save(true)} disabled={saving} className="btn btn-primary">
              <I.IconCheck /> {t("saveReviewed")}
            </button>
            <button onClick={() => save(false)} disabled={saving} className="btn btn-secondary">
              {t("saveDraft")}
            </button>
          </div>
          <p className="text-xs text-muted">{t("count", { n: rows.length })}</p>
        </div>
      </div>

      <ol className="space-y-2">
        {list.map((r) => {
          const i = rows.indexOf(r);
          const isLow = r.confidence !== null && r.confidence < LOW;
          return (
            <li key={r.key} className={`rounded-xl border p-3 ${r.hidden ? "opacity-50" : ""} ${isLow ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20" : "border-line bg-card"}`}>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button onClick={() => listen(r)} className="icon-btn icon-btn-outline" aria-label={t("listen")}>
                  <I.IconPlay className="h-3.5 w-3.5" />
                </button>
                <span className="font-mono text-muted">#{i + 1}</span>
                {nudge("−", () => change(r.key, { start: r2(Math.max(0, r.start - 0.25)) }))}
                <span className="font-mono">{r.start.toFixed(2)}</span>
                {nudge("+", () => change(r.key, { start: r2(Math.min(r.end - 0.3, r.start + 0.25)) }))}
                <span className="text-muted">→</span>
                {nudge("−", () => change(r.key, { end: r2(Math.max(r.start + 0.3, r.end - 0.25)) }))}
                <span className="font-mono">{r.end.toFixed(2)}</span>
                {nudge("+", () => change(r.key, { end: r2(r.end + 0.25) }))}
                {r.confidence !== null && <span className={`ml-1 ${isLow ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted"}`}>{t("confidence", { pct: Math.round(r.confidence * 100) })}</span>}
                <input value={r.speaker ?? ""} onChange={(e) => change(r.key, { speaker: e.target.value || null })} placeholder={t("speaker")} className="field field-sm ml-auto w-24" />
              </div>
              <textarea
                value={r.text}
                onChange={(e) => change(r.key, { text: e.target.value })}
                ref={(el) => void (el ? boxes.current.set(r.key, el) : boxes.current.delete(r.key))}
                rows={2}
                className="field mt-2 w-full resize-y font-serif text-[15px]"
              />
              {heard && <HeardLine heard={heardIn(heard, r.start + shift, r.end + shift)} text={r.text} />}
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                <button onClick={() => split(r.key)} className="btn btn-sm btn-ghost">
                  <I.IconScissors /> {t("split")}
                </button>
                {i < rows.length - 1 && (
                  <button onClick={() => join(r.key)} className="btn btn-sm btn-ghost">
                    <I.IconArrowDown /> {t("join")}
                  </button>
                )}
                <label className="ml-auto flex items-center gap-1 text-muted">
                  <input type="checkbox" checked={r.hidden} onChange={(e) => change(r.key, { hidden: e.target.checked })} /> {t("hidden")}
                </label>
                <button onClick={() => (setDirty(true), setRows((rs) => rs.filter((x) => x.key !== r.key)))} className="btn btn-sm btn-ghost text-red-600" aria-label={t("delete")}>
                  <I.IconTrash />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Under a sentence: what Whisper heard in its time, words not in the sentence marked; and the sentence's words Whisper
 * did not hear (a name or a "Q31" left in the text, or a cut in the wrong place). Whisper mishears too: a hint only.
 */
function HeardLine({ heard, text }: { heard: string[]; text: string }) {
  const t = useTranslations("listen.edit");
  const mine = new Set(text.split(/\s+/).map(norm).filter(Boolean));
  const got = new Set(heard.map(norm));
  const missing = text.split(/\s+/).filter((w) => norm(w) && !got.has(norm(w)));
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted">
      <p>
        <span className="font-semibold">{t("heard")}</span>{" "}
        {heard.length
          ? heard.map((w, k) => (
              <span key={k} className={mine.has(norm(w)) ? "" : "rounded bg-amber-100 px-0.5 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"}>
                {w}{" "}
              </span>
            ))
          : t("heardNothing")}
      </p>
      {missing.length > 0 && heard.length > 0 && (
        <p>
          <span className="font-semibold">{t("notHeard")}</span> <span className="text-red-700 dark:text-red-400">{missing.join(", ")}</span>
        </p>
      )}
    </div>
  );
}
