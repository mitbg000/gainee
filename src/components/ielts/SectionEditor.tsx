"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { formatAnswers, formatItems, formatOptions, GROUP_TYPES, parseAnswers, parseItems, parseOptions, type Group, type GroupType, type SectionContent, type Skill } from "@/lib/ielts/types";
import Questions, { Passage } from "./Questions";
import * as I from "@/components/icons";
import Info from "@/components/Info";
import { ask } from "@/components/Toaster";

type EditGroup = { type: GroupType; from: number; to: number; instructions: string; text: string; optionsTitle: string; options: string; items: string; image?: string; itemImages: Record<number, string> };
export type EditorData = {
  id: number;
  skill: Skill;
  part: number;
  title: string | null;
  label: string;
  bookId: number;
  content: SectionContent;
  answers: Record<string, string>;
  transcript: string | null;
  audio: { fileId: number; start?: number | null; end?: number | null } | null;
  pages: [number, number];
  reviewed: boolean;
  pageImages: { page: number; url: string | null }[];
  audioFiles: { id: number; name: string }[];
};

const toEdit = (g: Group): EditGroup => ({ type: g.type, from: g.from, to: g.to, instructions: g.instructions ?? "", text: g.text ?? "", optionsTitle: g.optionsTitle ?? "", options: formatOptions(g.options), items: formatItems(g.items), image: g.image, itemImages: Object.fromEntries((g.items ?? []).filter((it) => it.image).map((it) => [it.n[0], it.image!])) });
const fromEdit = (g: EditGroup): Group => {
  const out: Group = { type: g.type, from: Number(g.from), to: Number(g.to), instructions: g.instructions };
  if (g.type === "gap") out.text = g.text;
  else out.items = parseItems(g.items).map((it) => (g.itemImages[it.n[0]] ? { ...it, image: g.itemImages[it.n[0]] } : it));
  if (g.type === "match") {
    out.options = parseOptions(g.options);
    if (g.optionsTitle) out.optionsTitle = g.optionsTitle;
  }
  if (g.image) out.image = g.image;
  return out;
};
const mmss = (s?: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const secs = (v: string) => {
  if (!v.trim()) return null;
  const [m, s] = v.split(":").map(Number);
  return s === undefined ? m : m * 60 + s;
};

/** Crop a rectangle out of a page picture in the browser and upload it as an image → its URL. */
async function cropAndUpload(img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }) {
  const c = document.createElement("canvas");
  c.width = Math.round(box.w * img.naturalWidth);
  c.height = Math.round(box.h * img.naturalHeight);
  c.getContext("2d")!.drawImage(img, box.x * img.naturalWidth, box.y * img.naturalHeight, c.width, c.height, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
  if (!blob) throw new Error("crop failed");
  const form = new FormData();
  form.append("file", blob, "figure.png");
  const r = await fetch("/api/images", { method: "POST", body: form });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).url as string;
}

function PageCropper({ url, page, onCrop }: { url: string; page: number; onCrop: ((img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }) => void) | null }) {
  const img = useRef<HTMLImageElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const pos = (e: React.PointerEvent) => {
    const r = img.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const box = drag && { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
  return (
    <figure className="relative select-none">
      <figcaption className="mb-1 text-xs text-muted">p. {page}</figcaption>
      <div
        className={`relative ${onCrop ? "cursor-crosshair" : ""}`}
        onPointerDown={(e) => {
          if (!onCrop) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = pos(e);
          setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        }}
        onPointerMove={(e) => drag && setDrag({ ...drag, x1: pos(e).x, y1: pos(e).y })}
        onPointerUp={() => {
          if (onCrop && box && box.w > 0.02 && box.h > 0.02) onCrop(img.current!, box);
          setDrag(null);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} src={url} alt={`page ${page}`} draggable={false} className="w-full rounded border border-line bg-white" />
        {box && <div className="pointer-events-none absolute border-2 border-accent bg-accent/15" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} />}
      </div>
    </figure>
  );
}

/** Review screen for one section: fix what the AI read, crop pictures from the page, set answers and the audio stretch. */
export default function SectionEditor({ data, next }: { data: EditorData; next: number | null }) {
  const t = useTranslations("ielts.edit");
  const router = useRouter();
  const [title, setTitle] = useState(data.title ?? "");
  const [passage, setPassage] = useState(data.content.passage ?? "");
  const [intro, setIntro] = useState(data.content.intro ?? "");
  const [prompt, setPrompt] = useState(data.content.prompt ?? "");
  const [image, setImage] = useState(data.content.image);
  const [groups, setGroups] = useState<EditGroup[]>(data.content.groups.map(toEdit));
  const [answers, setAnswers] = useState(formatAnswers(data.answers));
  const [transcript, setTranscript] = useState(data.transcript ?? "");
  const [audio, setAudio] = useState(data.audio);
  const [pages, setPages] = useState<[number, number]>(data.pages);
  // what the next crop is for: Writing chart, a question group, or one question of a group
  const [cropFor, setCropFor] = useState<number | "writing" | { g: number; n: number } | { at: number } | null>(null);
  const passageBox = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"preview" | "pages">("preview");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement>(null);
  const warnings = data.content.warnings ?? [];

  const content: SectionContent = { passage: passage || undefined, intro: intro || undefined, prompt: prompt || undefined, image, groups: groups.map(fromEdit), warnings };
  const setG = (i: number, patch: Partial<EditGroup>) => setGroups((gs) => gs.map((g, k) => (k === i ? { ...g, ...patch } : g)));

  async function save(reviewed: boolean, goNext = false) {
    setBusy("save");
    setMsg(null);
    const r = await fetch(`/api/ielts/sections/${data.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title || null, content, answers: parseAnswers(answers), transcript: transcript || null, audio, pages, reviewed }),
    });
    setBusy(null);
    if (!r.ok) return setMsg(t("saveFailed", { error: ((await r.json().catch(() => ({}))) as { error?: string }).error ?? r.status }));
    setMsg(t("saved"));
    if (goNext && next) router.push(`/ielts/sections/${next}/edit`);
    else router.refresh();
  }
  async function reparse() {
    if (!await ask(t("reparseConfirm"))) return;
    setBusy("reparse");
    const r = await fetch(`/api/ielts/sections/${data.id}/reparse`, { method: "POST" });
    setBusy(null);
    if (!r.ok) return setMsg(r.status === 409 ? t("noAi") : t("reparseFailed"));
    const c = (await r.json()) as SectionContent;
    setGroups(c.groups.map(toEdit));
    setPassage(c.passage ?? "");
    setIntro(c.intro ?? "");
    setPrompt(c.prompt ?? "");
  }
  /** AI writes a completion group again with [[n]] blanks: from its cropped picture, else from the book's pages. */
  async function aiBlanks(i: number) {
    const g = groups[i];
    if (g.text.trim() && !await ask(t("aiBlanksConfirm"))) return;
    setBusy(`picture${i}`);
    setMsg(null);
    const body = JSON.stringify({ image: g.image, from: Number(g.from), to: Number(g.to), instructions: g.instructions, answers: parseAnswers(answers) });
    const r = await fetch(g.image ? "/api/ielts/read-picture" : `/api/ielts/sections/${data.id}/blanks`, { method: "POST", headers: { "content-type": "application/json" }, body }).catch(() => null);
    setBusy(null);
    if (!r?.ok) {
      const e = ((await r?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
      return setMsg(r?.status === 409 ? t("noAi") : e === "no_page_text" ? t("noPageText") : t("readPictureFailed"));
    }
    const d = (await r.json()) as { text: string; wrong: number[] };
    setG(i, { text: d.text });
    if (d.wrong.length) setMsg(t("readPictureCheck", { nums: d.wrong.join(", ") }));
  }
  /** AI reads the answer key again; answers already written stay, the missing ones are filled in. */
  async function readKey() {
    setBusy("key");
    setMsg(null);
    const r = await fetch(`/api/ielts/sections/${data.id}/answers`, { method: "POST" }).catch(() => null);
    setBusy(null);
    if (!r?.ok) return setMsg(r?.status === 409 ? t("noAi") : r?.status === 404 ? t("noKeyPages") : t("readKeyFailed"));
    const found = (await r.json()).answers as Record<string, string>;
    const have = parseAnswers(answers);
    const added = Object.keys(found).filter((n) => !have[n]).length;
    setAnswers(formatAnswers(Object.fromEntries(Object.entries({ ...found, ...have }).sort((a, b) => Number(a[0]) - Number(b[0])))));
    setMsg(t("readKeyDone", { found: Object.keys(found).length, added }));
  }
  /** No key in the book: AI works the answers out from the questions and the transcript; written answers stay. */
  async function aiKey() {
    setBusy("aiKey");
    setMsg(null);
    const r = await fetch(`/api/ielts/sections/${data.id}/answers-ai`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript }) }).catch(() => null);
    setBusy(null);
    if (!r?.ok) return setMsg(r?.status === 409 ? t("noAi") : r?.status === 404 ? t("aiKeyNoSource") : t("readKeyFailed"));
    const found = (await r.json()).answers as Record<string, string>;
    const have = parseAnswers(answers);
    const added = Object.keys(found).filter((n) => !have[n]).length;
    setAnswers(formatAnswers(Object.fromEntries(Object.entries({ ...found, ...have }).sort((a, b) => Number(a[0]) - Number(b[0])))));
    setMsg(t("aiKeyDone", { found: Object.keys(found).length, added }));
  }
  /** The book prints no transcript: the worker hears the part's saved audio stretch; the text lands in the editor. */
  async function transcribe() {
    if (transcript.trim() && !await ask(t("transcribeConfirm"))) return;
    setBusy("transcribe");
    setMsg(t("transcribing"));
    const r = await fetch(`/api/ielts/sections/${data.id}/transcribe`, { method: "POST" }).catch(() => null);
    if (!r?.ok) return (setBusy(null), setMsg(t("transcribeFailed", { error: "start" })));
    const { jobId } = (await r.json()) as { jobId: number };
    for (;;) {
      await new Promise((ok) => setTimeout(ok, 3000));
      const j = (await fetch(`/api/jobs/${jobId}`)
        .then((x) => x.json())
        .catch(() => null)) as { status: string; progress: string | null; result: { text?: string } | null; error: string | null } | null;
      if (!j) continue;
      if (j.status === "done") {
        setBusy(null);
        setTranscript(j.result?.text ?? "");
        return setMsg(t("transcribed"));
      }
      if (j.status === "failed" || j.status === "cancelled") return (setBusy(null), setMsg(t("transcribeFailed", { error: j.error ?? j.status })));
      setMsg(`${t("transcribing")} ${j.progress ?? ""}`);
    }
  }
  async function fixScript() {
    setBusy("script");
    setMsg(null);
    const r = await fetch(`/api/ielts/sections/${data.id}/fix-script`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: transcript }) }).catch(() => null);
    setBusy(null);
    if (!r?.ok) return setMsg(r?.status === 409 ? t("noAi") : t("fixScriptFailed"));
    setTranscript((await r.json()).text);
    setMsg(t("fixScriptDone"));
  }
  async function onCrop(img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }) {
    if (cropFor === null) return;
    setBusy("crop");
    try {
      const url = await cropAndUpload(img, box);
      if (cropFor === "writing") setImage(url);
      else if (typeof cropFor === "number") setG(cropFor, { image: url });
      // a picture of the reading passage goes in at the cursor, as its own paragraph
      else if ("at" in cropFor) setPassage((p) => `${p.slice(0, cropFor.at).trimEnd()}\n\n![](${url})\n\n${p.slice(cropFor.at).trimStart()}`.trim());
      else setG(cropFor.g, { itemImages: { ...groups[cropFor.g].itemImages, [cropFor.n]: url } });
      setCropFor(null);
      setTab("preview");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(null);
    }
  }
  const startCrop = (target: number | "writing" | { g: number; n: number } | { at: number }) => {
    setCropFor(target);
    setTab("pages");
  };

  const shown = data.pageImages.filter((p) => p.page >= pages[0] && p.page <= pages[1] && p.url);
  const key = parseAnswers(answers);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/ielts/books/${data.bookId}`} className="icon-btn" aria-label={t("back")}>
          <I.IconArrowLeft />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{data.label}</h1>
        {msg && <span className="text-sm text-muted">{msg}</span>}
        {data.skill !== "writing" && (
          <button onClick={reparse} disabled={!!busy} className="btn btn-sm btn-ghost">
            <I.IconRefresh /> {busy === "reparse" ? t("reparsing") : t("reparse")}
          </button>
        )}
        <button onClick={() => save(false)} disabled={!!busy} className="btn btn-sm btn-secondary">
          {t("save")}
        </button>
        <button onClick={() => save(true, true)} disabled={!!busy} className="btn btn-sm btn-primary">
          <I.IconCheck /> {next ? t("approveNext") : t("approve")}
        </button>
      </div>

      {warnings.length > 0 && (
        <ul className="mb-4 list-disc rounded-xl border border-amber-300 bg-amber-50 p-3 pl-8 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ---------- form ---------- */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 rounded-2xl border border-line bg-card p-4">
            <label className="min-w-40 flex-1 text-sm">
              <span className="font-semibold">{t("title")}</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="field field-sm mt-1 w-full" />
            </label>
            <label className="text-sm">
              <span className="font-semibold">{t("pages")}</span>
              <span className="mt-1 flex items-center gap-1">
                <input type="number" value={pages[0]} onChange={(e) => setPages([Number(e.target.value), pages[1]])} className="field field-sm w-20" />–
                <input type="number" value={pages[1]} onChange={(e) => setPages([pages[0], Number(e.target.value)])} className="field field-sm w-20" />
              </span>
            </label>
          </div>

          {data.skill === "writing" ? (
            <div className="rounded-2xl border border-line bg-card p-4">
              <label className="block text-sm font-semibold">{t("prompt")}</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={8} className="field mt-1 w-full py-2" />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={() => startCrop("writing")} className="btn btn-sm btn-secondary">
                  <I.IconImage /> {image ? t("recrop") : t("crop")}
                </button>
                {image && (
                  <button onClick={() => setImage(undefined)} className="btn btn-sm btn-danger">
                    {t("removeImage")}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {data.skill === "reading" && (
                <div className="rounded-2xl border border-line bg-card p-4">
                  <label className="block text-sm font-semibold">{t("intro")}</label>
                  <input value={intro} onChange={(e) => setIntro(e.target.value)} className="field field-sm mt-1 w-full" />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="flex flex-1 items-center gap-1.5">
                      <label className="text-sm font-semibold">{t("passage")}</label>
                      <Info label={t("passage")} text={t("passageHint")} />
                    </span>
                    <button onClick={() => startCrop({ at: passageBox.current?.selectionStart ?? passage.length })} className="btn btn-sm btn-ghost">
                      <I.IconImage /> {t("cropPassage")}
                    </button>
                  </div>
                  <textarea ref={passageBox} value={passage} onChange={(e) => setPassage(e.target.value)} rows={14} className="field mt-1 w-full py-2 font-serif" />
                </div>
              )}
              {groups.map((g, i) => (
                <div key={i} className="rounded-2xl border border-line bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={g.type} onChange={(e) => setG(i, { type: e.target.value as GroupType })} className="field field-sm">
                      {GROUP_TYPES.map((x) => (
                        <option key={x} value={x}>
                          {t(`types.${x}`)}
                        </option>
                      ))}
                    </select>
                    <input type="number" value={g.from} onChange={(e) => setG(i, { from: Number(e.target.value) })} className="field field-sm w-16" aria-label="from" />–
                    <input type="number" value={g.to} onChange={(e) => setG(i, { to: Number(e.target.value) })} className="field field-sm w-16" aria-label="to" />
                    <span className="flex-1" />
                    <button onClick={() => startCrop(i)} className="btn btn-sm btn-ghost">
                      <I.IconImage /> {g.image ? t("recrop") : t("crop")}
                    </button>
                    {g.image && (
                      <button onClick={() => setG(i, { image: undefined })} className="btn btn-sm btn-danger" aria-label={t("removeImage")}>
                        <I.IconX />
                      </button>
                    )}
                    <button onClick={async () => (await ask(t("removeGroup"), { danger: true })) && setGroups(groups.filter((_, k) => k !== i))} className="btn btn-sm btn-danger" aria-label={t("removeGroup")}>
                      <I.IconTrash />
                    </button>
                  </div>
                  <textarea value={g.instructions} onChange={(e) => setG(i, { instructions: e.target.value })} rows={2} placeholder={t("instructions")} className="field mt-2 w-full py-2 text-sm" />
                  {g.type === "gap" ? (
                    <>
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="flex flex-1 items-center gap-1.5 font-medium">
                          {t("questionsText")}
                          <Info label={t("questionsText")} text={`${t("gapHint")} ${t("tableHint", { br: "<br>" })}`} />
                        </span>
                        <button onClick={() => aiBlanks(i)} disabled={!!busy} className="btn btn-sm btn-secondary" title={g.image ? t("aiBlanksFromPicture") : t("aiBlanksFromPages")}>
                          <I.IconSpark /> {busy === `picture${i}` ? t("readingPicture") : t("aiBlanks")}
                        </button>
                        {/* plain answer lines "9. [[9]]" for every number: the questions are read on the picture */}
                        <button
                          onClick={async () => (!g.text.trim() || (await ask(t("simpleBlanksConfirm")))) && setG(i, { text: Array.from({ length: Math.max(0, Number(g.to) - Number(g.from) + 1) }, (_, k) => `${Number(g.from) + k}. [[${Number(g.from) + k}]]`).join("\n") })}
                          className="btn btn-sm btn-ghost"
                        >
                          <I.IconChecklist /> {t("simpleBlanks")}
                        </button>
                      </p>
                      <textarea value={g.text} onChange={(e) => setG(i, { text: e.target.value })} rows={8} className="field mt-1 w-full py-2 font-mono text-sm" />

                    </>
                  ) : (
                    <>
                      {g.type === "match" && (
                        <>
                          <input value={g.optionsTitle} onChange={(e) => setG(i, { optionsTitle: e.target.value })} placeholder={t("optionsTitle")} className="field field-sm mt-2 w-full" />
                          <textarea value={g.options} onChange={(e) => setG(i, { options: e.target.value })} rows={4} placeholder={t("optionsHint")} className="field mt-1 w-full py-2 font-mono text-sm" />
                        </>
                      )}
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                        {t("questionsText")}
                        <Info label={t("questionsText")} text={t(g.type === "mcq" || g.type === "multi" ? "itemsHintChoice" : "itemsHint")} />
                      </p>
                      <textarea value={g.items} onChange={(e) => setG(i, { items: e.target.value })} rows={8} className="field mt-1 w-full py-2 font-mono text-sm" />
                      {/* a picture for one question: a chart whose columns are the options, drawings A–C… */}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        {Object.entries(g.itemImages).map(([n, url]) => (
                          <span key={n} className="flex items-center gap-1 rounded-lg border border-line p-1">
                            <b className="px-1">{n}</b>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="h-10 rounded bg-white" />
                            <button onClick={() => setG(i, { itemImages: Object.fromEntries(Object.entries(g.itemImages).filter(([k]) => k !== n)) })} className="icon-btn" aria-label={t("removeImage")}>
                              <I.IconX />
                            </button>
                          </span>
                        ))}
                        <select
                          value=""
                          onChange={(e) => e.target.value && startCrop({ g: i, n: Number(e.target.value) })}
                          className="field field-sm"
                          aria-label={t("cropItem")}
                        >
                          <option value="">{t("cropItem")}</option>
                          {Array.from({ length: Math.max(0, g.to - g.from + 1) }, (_, k) => g.from + k).map((n) => (
                            <option key={n} value={n}>
                              {t("question", { n })}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              ))}
              <button
                onClick={() => {
                  const last = groups[groups.length - 1];
                  const from = last ? last.to + 1 : data.skill === "listening" ? (data.part - 1) * 10 + 1 : 1;
                  setGroups([...groups, { type: "gap", from, to: from, instructions: "", text: "", optionsTitle: "", options: "", items: "", itemImages: {} }]);
                }}
                className="btn btn-sm btn-secondary"
              >
                <I.IconPlus /> {t("addGroup")}
              </button>
              <div className="rounded-2xl border border-line bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex flex-1 items-center gap-1.5">
                    <label className="text-sm font-semibold">{t("answers")}</label>
                    <Info label={t("answers")} text={t("answersHint")} />
                  </span>
                  <button onClick={readKey} disabled={!!busy} className="btn btn-sm btn-ghost">
                    <I.IconSpark /> {busy === "key" ? t("readingKey") : t("readKey")}
                  </button>
                  <button onClick={aiKey} disabled={!!busy} className="btn btn-sm btn-ghost" title={t("aiKeyHint")}>
                    <I.IconSpark /> {busy === "aiKey" ? t("aiKeyWorking") : t("aiKey")}
                  </button>
                </div>
                <textarea value={answers} onChange={(e) => setAnswers(e.target.value)} rows={8} className="field mt-1 w-full py-2 font-mono text-sm" />
              </div>
              {data.skill === "listening" && (
                <div className="space-y-3 rounded-2xl border border-line bg-card p-4">
                  <span className="flex items-center gap-1.5">
                    <label className="text-sm font-semibold">{t("audio")}</label>
                    <Info label={t("audio")} text={t("audioHint")} />
                  </span>
                  <select value={audio?.fileId ?? ""} onChange={(e) => setAudio(e.target.value ? { fileId: Number(e.target.value), start: audio?.start ?? null, end: audio?.end ?? null } : null)} className="field field-sm w-full">
                    <option value="">{t("noAudio")}</option>
                    {data.audioFiles.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  {audio && (
                    <>
                      <audio ref={player} src={`/api/ielts/audio/${audio.fileId}`} controls preload="metadata" className="w-full" />
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {(["start", "end"] as const).map((k) => (
                          <span key={k} className="flex items-center gap-1">
                            {t(k)}
                            <input value={mmss(audio[k])} onChange={(e) => setAudio({ ...audio, [k]: secs(e.target.value) })} placeholder="m:ss" className="field field-sm w-20" />
                            <button onClick={() => setAudio({ ...audio, [k]: Math.round(player.current?.currentTime ?? 0) })} className="btn btn-sm btn-ghost">
                              {t("now")}
                            </button>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex-1 text-sm font-semibold">{t("transcript")}</label>
                    {audio && (
                      <button onClick={transcribe} disabled={!!busy} className="btn btn-sm btn-ghost" title={t("transcribeHint")}>
                        <I.IconHeadphones /> {busy === "transcribe" ? t("transcribingShort") : t("transcribe")}
                      </button>
                    )}
                    <button onClick={fixScript} disabled={!!busy || transcript.trim().length < 20} className="btn btn-sm btn-ghost">
                      <I.IconSpark /> {busy === "script" ? t("fixingScript") : t("fixScript")}
                    </button>
                  </div>
                  <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={8} className="field w-full py-2 text-sm" />
                </div>
              )}
            </>
          )}
        </div>

        {/* ---------- preview / book pages ---------- */}
        <div className="xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
          <div className="mb-3 flex gap-1">
            <button onClick={() => setTab("preview")} role="tab" className="tab" aria-selected={tab === "preview"}>
              {t("preview")}
            </button>
            <button onClick={() => setTab("pages")} role="tab" className="tab" aria-selected={tab === "pages"}>
              {t("bookPages")}
            </button>
          </div>
          {tab === "pages" ? (
            <div className="space-y-3">
              {cropFor !== null && (
                <p className="sticky top-0 z-10 flex items-center gap-2 rounded-lg bg-accent p-2 text-sm text-on-accent">
                  {busy === "crop" ? t("cropping") : t("cropHint")}
                  <button onClick={() => setCropFor(null)} className="ml-auto underline">
                    {t("cancel")}
                  </button>
                </p>
              )}
              {shown.length ? shown.map((p) => <PageCropper key={p.page} url={p.url!} page={p.page} onCrop={cropFor !== null ? onCrop : null} />) : <p className="text-sm text-muted">{t("noPages")}</p>}
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-card p-5">
              {data.skill === "writing" ? (
                <>
                  <p className="whitespace-pre-line">{prompt}</p>
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="mt-3 max-w-full rounded border border-line bg-white" />
                  )}
                </>
              ) : (
                <>
                  {data.skill === "reading" && passage && (
                    <div className="mb-6 border-b border-line pb-4 font-serif">
                      <Passage text={passage} intro={intro} />
                    </div>
                  )}
                  <Questions content={content} sid={data.id} values={Object.fromEntries(Object.entries(key).map(([n, v]) => [`${data.id}:${n}`, v]))} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
