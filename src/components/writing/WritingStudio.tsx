"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import Markdown from "@/components/lesson/Markdown";
import PromptView from "@/components/writing/Chart";
import ModelPicker, { loadModelChoice, type ModelChoice } from "@/components/ModelPicker";
import type { Grade, WritingKind } from "@/lib/writing";
import * as I from "@/components/icons";
import { ask } from "@/components/Toaster";

const KINDS: WritingKind[] = ["task2", "task1", "translate", "sentence", "free"];
const MIN_WORDS: Record<WritingKind, number> = { task1: 150, task2: 250, free: 0, translate: 0, sentence: 0 };
const MINUTES: Record<WritingKind, number> = { task1: 20, task2: 40, free: 0, translate: 20, sentence: 10 };
const isTranslation = (k: WritingKind) => k === "translate" || k === "sentence";
const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const json = (body: unknown) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

type Initial = { id: number; kind: WritingKind; prompt: string; body: string; grade: Grade | null } | null;

/** Write an IELTS answer: AI question or your own, word count + timer, auto-save, AI band scores. */
export default function WritingStudio({ initial, kind: startKind }: { initial: Initial; kind?: WritingKind }) {
  const t = useTranslations("writing");
  const router = useRouter();
  const [id, setId] = useState<number | null>(initial?.id ?? null);
  const kind: WritingKind = initial?.kind ?? startKind ?? "task2"; // fixed per draft; the type chips open another draft
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [editPrompt, setEditPrompt] = useState(!initial?.prompt);
  const [body, setBody] = useState(initial?.body ?? "");
  const [grade, setGrade] = useState<Grade | null>(initial?.grade ?? null);
  const [model, setModel] = useState<ModelChoice>(null);
  const [busy, setBusy] = useState<"" | "prompt" | "picture" | "grade">("");
  const [error, setError] = useState("");
  const [picError, setPicError] = useState("");
  const [saved, setSaved] = useState(true);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const savedRef = useRef(JSON.stringify({ kind, prompt, body }));
  const idRef = useRef(id);

  useEffect(() => setModel(loadModelChoice()), []);
  useEffect(() => {
    if (!startedAt) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [startedAt]);

  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const latest = useRef({ kind, prompt, body });
  latest.current = { kind, prompt, body };

  /** Saves the current text; calls run one after another so the first save never creates two drafts. */
  function save(keepalive = false): Promise<boolean> {
    queue.current = queue.current.then(async () => {
      const data = latest.current;
      const snap = JSON.stringify(data);
      if (snap === savedRef.current || (!data.prompt.trim() && !data.body.trim())) return true;
      try {
        const r = idRef.current
          ? await fetch(`/api/writings/${idRef.current}`, { method: "PUT", keepalive, ...json(data) })
          : await fetch("/api/writings", { method: "POST", keepalive, ...json(data) });
        if (!r.ok) return false;
        if (!idRef.current) {
          idRef.current = (await r.json()).id as number;
          setId(idRef.current);
          // reloading or coming back opens this draft again
          window.history.replaceState(null, "", `/writing?id=${idRef.current}`);
        }
        savedRef.current = snap;
        setSaved(JSON.stringify(latest.current) === snap);
        return true;
      } catch {
        return false;
      }
    });
    return queue.current;
  }
  // auto-save shortly after typing stops
  useEffect(() => {
    if (JSON.stringify({ kind, prompt, body }) === savedRef.current) return;
    setSaved(false);
    const h = setTimeout(() => save(), 800);
    return () => clearTimeout(h);
  }, [kind, prompt, body]);
  // ...and right away when the tab is hidden, the app is switched or the page is left
  useEffect(() => {
    const flush = () => document.visibilityState === "hidden" && save(true);
    const leave = () => save(true);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", flush);
      save(true); // navigating to another page inside the app
    };
  }, []);

  // the timer continues from the time already spent when the draft is opened again (time away is not counted)
  useEffect(() => {
    if (!id || startedAt) return;
    try {
      const spent = Number(localStorage.getItem(`wr_time_${id}`));
      if (spent > 0) {
        setStartedAt(Date.now() - spent * 1000);
        setNow(Date.now());
      }
    } catch {}
  }, [id, startedAt]);
  useEffect(() => {
    if (!id || !startedAt || !now) return;
    try {
      localStorage.setItem(`wr_time_${id}`, String(Math.floor((now - startedAt) / 1000)));
    } catch {}
  }, [id, startedAt, now]);

  async function newPrompt() {
    setBusy("prompt");
    setError("");
    const r = await fetch("/api/writings/prompt", { method: "POST", ...json({ kind, override: model ?? undefined }) });
    setBusy("");
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error === "ai_not_configured" ? t("notConfigured") : t("aiError"));
    const text: string = (await r.json()).prompt;
    setPrompt(text);
    setEditPrompt(false);
    if (kind === "task1") drawPicture(text);
  }

  /** Task 1: ask for the AI picture separately (only drawn for processes, technical diagrams and maps when turned on in Settings). */
  async function drawPicture(text: string) {
    setBusy("picture");
    setPicError("");
    const r = await fetch("/api/writings/picture", { method: "POST", ...json({ prompt: text }) }).catch(() => null);
    setBusy("");
    if (!r?.ok) return setPicError(r ? ((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`) : t("network"));
    const next: string | null = (await r.json()).prompt;
    if (next) setPrompt((cur) => (cur === text ? next : cur)); // keep edits made while drawing
  }

  async function doGrade() {
    setBusy("grade");
    setError("");
    if (!(await save()) || !idRef.current) {
      setBusy("");
      return setError(t("saveError"));
    }
    const r = await fetch(`/api/writings/${idRef.current}/grade`, { method: "POST", ...json({ override: model ?? undefined }) });
    setBusy("");
    if (!r.ok) {
      const e = (await r.json().catch(() => ({}))).error;
      return setError(e === "ai_not_configured" ? t("notConfigured") : `${t("aiError")} ${e ?? ""}`);
    }
    setGrade(await r.json());
    router.refresh(); // update the band in the history list
  }

  async function remove() {
    if (!idRef.current || !await ask(t("deleteConfirm"), { danger: true })) return;
    await fetch(`/api/writings/${idRef.current}`, { method: "DELETE" });
    router.push(`/writing?new=1&kind=${kind}`);
    router.refresh();
  }

  const words = countWords(body);
  const min = MIN_WORDS[kind];
  const limit = MINUTES[kind] * 60;
  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const left = limit - elapsed;
  const clock = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;

  return (
    <div className="min-w-0 space-y-4">
      {/* task type + model */}
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={async () => {
              if (k === kind) return;
              // another type opens its own draft (or a blank one) instead of reusing this text
              await save();
              router.push(`/writing?kind=${k}`);
              router.refresh();
            }}
            className={`chip ${kind === k ? "chip-on" : ""}`}
          >
            {t(`kind.${k}`)}
          </button>
        ))}
        <span className="ml-auto">
          <ModelPicker value={model} onChange={setModel} />
        </span>
      </div>

      {/* question */}
      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-accent2">{isTranslation(kind) ? t("source") : t("question")}</h2>
          <span className="ml-auto flex gap-2">
            <button onClick={newPrompt} disabled={!!busy || !!grade} className="btn btn-sm btn-outline">
              <I.IconSpark className="inline-block h-4 w-4 align-[-0.2em]" /> {busy === "prompt" ? t("generating") : t("aiPrompt")}
            </button>
            {!grade && (
              <button onClick={() => setEditPrompt(!editPrompt)} className="btn btn-sm btn-secondary">
                {editPrompt ? t("done") : <><I.IconEdit className="inline-block h-4 w-4 align-[-0.2em]" /> {t("editPrompt")}</>}
              </button>
            )}
          </span>
        </div>
        {editPrompt ? (
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} placeholder={isTranslation(kind) ? t("sourcePlaceholder") : t("promptPlaceholder")} className="field w-full p-3 text-base" />
        ) : (
          <PromptView text={prompt} className="text-[15px] leading-relaxed" />
        )}
        {busy === "picture" && <p className="mt-2 animate-pulse text-sm text-muted">{t("drawing")}</p>}
        {picError && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-red-600">
            {t("pictureError", { error: picError })}
            <button onClick={() => drawPicture(prompt)} className="btn btn-sm btn-outline">
              {t("retry")}
            </button>
          </p>
        )}
      </section>

      {/* answer */}
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
          <span className={`font-semibold ${min && words < min ? "text-amber-600" : "text-green-600"}`}>
            {t("words", { n: words })}
            {min ? ` / ${min}` : ""}
          </span>
          {limit > 0 && (
            <span className={`rounded-lg bg-card px-2 py-0.5 font-mono tabular-nums ${startedAt && left < 0 ? "text-red-600" : "text-muted"}`} title={t("timer", { n: MINUTES[kind] })}>
              <I.IconClock className="inline-block h-4 w-4 align-[-0.2em]" /> {startedAt ? `${left < 0 ? "+" : ""}${clock(left)}` : clock(limit)}
            </span>
          )}
          <span className="ml-auto text-xs text-muted">{saved ? (id ? t("saved") : "") : t("saving")}</span>
        </div>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (!startedAt) {
              setStartedAt(Date.now());
              setNow(Date.now());
            }
          }}
          rows={kind === "sentence" ? 8 : 16}
          spellCheck={false}
          placeholder={kind === "sentence" ? t("sentencePlaceholder") : kind === "translate" ? t("translatePlaceholder") : t("bodyPlaceholder")}
          className="w-full rounded-2xl border border-line bg-card p-4 font-serif text-[17px] leading-relaxed outline-none focus:border-accent"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={doGrade} disabled={!!busy || !body.trim() || !prompt.trim()} className="btn btn-primary">
            <I.IconSpark className="inline-block h-4 w-4 align-[-0.2em]" /> {busy === "grade" ? t("grading") : grade ? t("regrade") : t("grade")}
          </button>
          {grade && (
            <Link href={`/writing?new=1&kind=${kind}`} className="btn btn-secondary">
              <I.IconPlus className="inline-block h-4 w-4 align-[-0.2em]" /> {t("new")}
            </Link>
          )}
          {id && (
            <button onClick={remove} className="btn btn-danger ml-auto">
              <I.IconTrash className="inline-block h-4 w-4 align-[-0.2em]" /> {t("delete")}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      {/* result */}
      {grade && (
        <section className="rounded-2xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">{t("overall")}</p>
              <p className="font-serif text-4xl font-bold text-accent">{grade.overall}</p>
            </div>
            {grade.criteria.map((c) => (
              <div key={c.key} className="min-w-20 rounded-xl bg-paper px-3 py-2">
                <p className="text-xs text-muted">{t(`criteria.${c.key as "ta" | "tr" | "cc" | "lr" | "gra" | "acc"}`)}</p>
                <p className="text-xl font-bold">{c.band}</p>
              </div>
            ))}
          </div>
          <Markdown text={grade.feedback} className="mt-4 text-[15px] leading-relaxed" />
        </section>
      )}
    </div>
  );
}
