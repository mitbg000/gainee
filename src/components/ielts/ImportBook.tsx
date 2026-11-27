"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import * as I from "@/components/icons";
import { saveMarks } from "./FindMarks";
import { pageText, shownAt } from "@/lib/ielts/pdfText";
import { toast } from "@/components/Toaster";

const CHUNK = 4 * 1024 * 1024; // small enough to finish well inside proxy time limits on a slow upload
const PAGE_WIDTH = 1400; // px: sharp enough to crop a map or chart, ~150 KB per page as WebP
const BATCH = 4;
const MAX_PAGES = 600; // the server's limit for one book

/** Upload one audio file in 8 MB chunks (stays under proxy body limits; a failed chunk is retried from where the server stopped). */
export async function uploadAudio(bookId: number, file: File, onProgress: (done: number) => void) {
  const r = await fetch(`/api/ielts/books/${bookId}/audio`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size }) });
  if (!r.ok) throw new Error(`${file.name}: ${(await r.json().catch(() => ({}))).error ?? r.status}`);
  const { id } = await r.json();
  let offset = 0;
  let tries = 0;
  while (offset < file.size) {
    const res = await fetch(`/api/ielts/audio/${id}?offset=${offset}`, { method: "PUT", body: file.slice(offset, offset + CHUNK) }).catch(() => null);
    if (res?.ok || res?.status === 409) {
      offset = (await res.json()).received;
      tries = 0;
      onProgress(offset / file.size);
    } else if (++tries > 8) throw new Error(`${file.name}: upload failed`);
    else await new Promise((ok) => setTimeout(ok, Math.min(15_000, 1500 * tries)));
  }
  return id as number;
}

/** Add a new pick to the files already chosen: each pick is sorted by name, a file chosen twice is kept once. */
export function addFiles(have: File[], picked: FileList | null) {
  const fresh = Array.from(picked ?? []).filter((f) => !have.some((h) => h.name === f.name && h.size === f.size));
  return [...have, ...fresh.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))];
}

function Chosen({ files, onChange, disabled, remove }: { files: File[]; onChange: (f: File[]) => void; disabled: boolean; remove: string }) {
  if (!files.length) return null;
  return (
    <ol className="mt-2 max-h-48 space-y-1 overflow-y-auto">
      {files.map((f, i) => (
        <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 rounded-lg bg-paper px-3 py-1 text-sm">
          <span className="text-muted">{i + 1}.</span>
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <button type="button" disabled={disabled} onClick={() => onChange(files.filter((x) => x !== f))} aria-label={`${remove} ${f.name}`} className="icon-btn">
            <I.IconX />
          </button>
        </li>
      ))}
    </ol>
  );
}

type Ocr = { recognize: (c: HTMLCanvasElement) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };

/**
 * New IELTS book: the PDF is read in the browser (text layer + one picture per page, OCR of scanned pages with Tesseract
 * on this computer), so the server only stores small files; then the worker's AI turns the pages into tests.
 */
export default function ImportBook() {
  const t = useTranslations("ielts.import");
  const tm = useTranslations("ielts.marks");
  const ta = useTranslations("app");
  const router = useRouter();
  const [pdfs, setPdfs] = useState<File[]>([]);
  const [audio, setAudio] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [localOcr, setLocalOcr] = useState(true);
  const [autoMarks, setAutoMarks] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = status !== null && !error;

  async function start() {
    if (!pdfs.length) return;
    setError(null);
    let ocr: Ocr | null = null;
    try {
      setStatus(t("opening"));
      const { getDocumentProxy } = await import("unpdf");
      // several PDFs (one per test, answers apart…) become one book, pages in the order of the list
      const docs = [];
      for (const f of pdfs) docs.push(await getDocumentProxy(new Uint8Array(await f.arrayBuffer())));
      const n = docs.reduce((sum, d) => sum + d.numPages, 0);
      if (n > MAX_PAGES) throw new Error(t("tooManyPages", { n, max: MAX_PAGES }));
      const all = docs.flatMap((d) => Array.from({ length: d.numPages }, (_, i) => () => d.getPage(i + 1)));
      const r = await fetch("/api/ielts/books", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim() || pdfs[0].name.replace(/\.pdf$/i, ""), pageCount: n }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { id } = await r.json();

      let form = new FormData();
      let inForm = 0;
      let scanned = 0;
      const send = async () => {
        if (!inForm) return;
        const res = await fetch(`/api/ielts/books/${id}/pages`, { method: "POST", body: form });
        if (!res.ok) throw new Error(`pages: HTTP ${res.status}`);
        form = new FormData();
        inForm = 0;
      };
      for (let p = 1; p <= n; p++) {
        setStatus(t("page", { p, n }));
        setPct(p / n);
        const page = await all[p - 1]();
        const tc = await page.getTextContent();
        const vp1 = page.getViewport({ scale: 1 });
        // speaker names back in front of their lines (audioscripts), positions as shown even on rotated scans
        let text = pageText(tc.items.flatMap((it) => ("str" in it ? [{ str: it.str, hasEOL: it.hasEOL, ...shownAt(vp1.transform, it.transform) }] : [])));
        const vp = page.getViewport({ scale: PAGE_WIDTH / vp1.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas } as Parameters<typeof page.render>[0]).promise;
        if (text.replace(/\s/g, "").length < 40) {
          scanned++;
          if (localOcr) {
            setStatus(t("ocr", { p, n }));
            if (!ocr) {
              const { createWorker } = await import("tesseract.js");
              ocr = (await createWorker("eng")) as unknown as Ocr;
            }
            text = (await ocr.recognize(canvas)).data.text.trim();
          }
        }
        const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", 0.72));
        form.append("page", String(p));
        form.append(`text_${p}`, text);
        if (blob) form.append(`img_${p}`, blob, `${p}.webp`);
        page.cleanup();
        if (++inForm >= BATCH) await send();
      }
      await send();
      await ocr?.terminate();
      ocr = null;

      const skipped: string[] = [];
      for (const [i, f] of audio.entries()) {
        setStatus(t("audio", { i: i + 1, n: audio.length, name: f.name }));
        // one failed file does not stop the book: it can be added later on the book page
        const audioId = await uploadAudio(id, f, setPct).catch(() => (skipped.push(f.name), null));
        if (!audioId) continue;
        // one file for a whole test: let Whisper (in this browser) find where each part starts
        if (autoMarks && !/(section|part)[\s_-]*[1-4]/i.test(f.name))
          await saveMarks(audioId, f, (step, pct) => {
            setStatus(t("marks", { name: f.name, step: tm(`step.${step}`, { pct: Math.round(pct * 100) }) }));
            setPct(pct);
          }).catch((e) => console.warn("part marks:", e));
      }
      setStatus(t("queue"));
      const q = await fetch(`/api/ielts/books/${id}/import`, { method: "POST" });
      if (!q.ok) throw new Error(`import: HTTP ${q.status}`);
      if (scanned && !localOcr) console.info(`${scanned} scanned pages will be read by AI on the server`);
      if (skipped.length) toast(t("audioSkipped", { names: skipped.join(", ") }), "info");
      router.push(`/ielts/books/${id}`);
    } catch (e) {
      await ocr?.terminate().catch(() => {});
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-card p-5 md:p-6">
      <label className="block">
        <span className="text-sm font-semibold">{t("pdf")}</span>
        <input
          type="file"
          accept="application/pdf"
          multiple
          disabled={busy}
          onChange={(e) => {
            const next = addFiles(pdfs, e.target.files);
            e.target.value = ""; // so the same file can be chosen again after removing it
            setPdfs(next);
            if (next[0] && !title) setTitle(next[0].name.replace(/\.pdf$/i, ""));
          }}
          className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:font-semibold file:text-on-accent"
        />
        <span className="mt-1 block text-xs text-muted">{t("pdfHint")}</span>
      </label>
      <Chosen files={pdfs} onChange={setPdfs} disabled={busy} remove={ta("delete")} />
      <label className="block">
        <span className="text-sm font-semibold">{t("title")}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} placeholder="Cambridge IELTS 21" className="field mt-1 w-full" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">{t("audioFiles")}</span>
        <input type="file" accept="audio/*,.mp3,.m4a" multiple disabled={busy} onChange={(e) => {
          const next = addFiles(audio, e.target.files);
          e.target.value = "";
          setAudio(next);
        }} className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-paper file:px-3 file:py-2 file:font-semibold" />
        <span className="mt-1 block text-xs text-muted">{t("audioHint")}</span>
      </label>
      <Chosen files={audio} onChange={setAudio} disabled={busy} remove={ta("delete")} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={localOcr} onChange={(e) => setLocalOcr(e.target.checked)} disabled={busy} className="mt-0.5 size-4" />
        <span>
          <b>{t("localOcr")}</b>
          <span className="block text-muted">{t("localOcrHint")}</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={autoMarks} onChange={(e) => setAutoMarks(e.target.checked)} disabled={busy} className="mt-0.5 size-4" />
        <span>
          <b>{tm("auto")}</b>
          <span className="block text-muted">{tm("autoHint")}</span>
        </span>
      </label>
      {status && (
        <div>
          <p className="text-sm">{status}</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-line/70">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(pct * 100)}%` }} />
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button onClick={start} disabled={!pdfs.length || busy} className="btn btn-primary">
        <I.IconUpload /> {t("start")}
      </button>
      <p className="text-xs text-muted">{t("keepOpen")}</p>
    </div>
  );
}
