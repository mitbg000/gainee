"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import * as I from "@/components/icons";
import { saveMarks } from "./FindMarks";

const CHUNK = 8 * 1024 * 1024;
const PAGE_WIDTH = 1400; // px: sharp enough to crop a map or chart, ~150 KB per page as WebP
const BATCH = 4;

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
    } else if (++tries > 4) throw new Error(`${file.name}: upload failed`);
    else await new Promise((ok) => setTimeout(ok, 1500 * tries));
  }
  return id as number;
}

type Ocr = { recognize: (c: HTMLCanvasElement) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };

/**
 * New IELTS book: the PDF is read in the browser (text layer + one picture per page, OCR of scanned pages with Tesseract
 * on this computer), so the server only stores small files; then the worker's AI turns the pages into tests.
 */
export default function ImportBook() {
  const t = useTranslations("ielts.import");
  const tm = useTranslations("ielts.marks");
  const router = useRouter();
  const [pdf, setPdf] = useState<File | null>(null);
  const [audio, setAudio] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [localOcr, setLocalOcr] = useState(true);
  const [autoMarks, setAutoMarks] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = status !== null && !error;

  async function start() {
    if (!pdf) return;
    setError(null);
    let ocr: Ocr | null = null;
    try {
      setStatus(t("opening"));
      const { getDocumentProxy } = await import("unpdf");
      const doc = await getDocumentProxy(new Uint8Array(await pdf.arrayBuffer()));
      const n = doc.numPages;
      const r = await fetch("/api/ielts/books", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim() || pdf.name.replace(/\.pdf$/i, ""), pageCount: n }) });
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
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        let text = tc.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("").replace(/[ \t]+\n/g, "\n").trim();
        const vp1 = page.getViewport({ scale: 1 });
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

      for (const [i, f] of audio.entries()) {
        setStatus(t("audio", { i: i + 1, n: audio.length, name: f.name }));
        const audioId = await uploadAudio(id, f, setPct);
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
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setPdf(f);
            if (f && !title) setTitle(f.name.replace(/\.pdf$/i, ""));
          }}
          className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:font-semibold file:text-on-accent"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">{t("title")}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} placeholder="Cambridge IELTS 21" className="field mt-1 w-full" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">{t("audioFiles")}</span>
        <input type="file" accept="audio/*,.mp3,.m4a" multiple disabled={busy} onChange={(e) => setAudio(Array.from(e.target.files ?? []))} className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-paper file:px-3 file:py-2 file:font-semibold" />
        <span className="mt-1 block text-xs text-muted">{t("audioHint")}</span>
      </label>
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
      <button onClick={start} disabled={!pdf || busy} className="btn btn-primary">
        <I.IconUpload /> {t("start")}
      </button>
      <p className="text-xs text-muted">{t("keepOpen")}</p>
    </div>
  );
}
