"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import * as I from "@/components/icons";
import { ask, toast } from "@/components/Toaster";
import { MAX_PAGES, openPdfs, sendPages } from "./ImportBook";

type PdfFile = { name: string; from: number; to: number; count: number };

/** The PDF files a book was made of: add more (their pages go after the last one), or take one out. */
export default function PdfFiles({ bookId, files, pageCount }: { bookId: number; files: PdfFile[]; pageCount: number }) {
  const t = useTranslations("ielts.book");
  const ti = useTranslations("ielts.import");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function add(input: HTMLInputElement) {
    const picked = Array.from(input.files ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    input.value = ""; // so the same file can be chosen again
    if (!picked.length) return;
    try {
      setBusy(ti("opening"));
      const { docs, n } = await openPdfs(picked);
      if (pageCount + n > MAX_PAGES) throw new Error(ti("tooManyPages", { n: pageCount + n, max: MAX_PAGES }));
      const r = await fetch(`/api/ielts/books/${bookId}/files`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pages: n }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { from } = await r.json();
      await sendPages(bookId, from, docs, true, (msg, p) => setBusy(`${msg} · ${Math.round(p * 100)}%`), ti);
      toast(t("pdfAdded", { n }), "success", 8000);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
    setBusy(null);
    router.refresh();
  }

  async function remove(f: PdfFile) {
    if (!(await ask(t("pdfRemoveConfirm", { name: f.name || t("pdfOld"), n: f.count }), { danger: true }))) return;
    const r = await fetch(`/api/ielts/books/${bookId}/files`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.name }) });
    if (!r.ok) toast(`HTTP ${r.status}`, "error");
    router.refresh();
  }

  return (
    <div className="mt-6 rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-bold">{t("pdfFiles")}</h2>
        <label className={`btn btn-sm btn-secondary ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
          <I.IconUpload /> {busy ?? t("addPdf")}
          <input type="file" accept="application/pdf" multiple className="sr-only" disabled={!!busy} onChange={(e) => add(e.target)} />
        </label>
      </div>
      <p className="mt-1 text-xs text-muted">{t("pdfHint")}</p>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {files.map((f) => (
            <li key={f.name} className="flex flex-wrap items-center gap-2">
              <I.IconFile className="h-4 w-4 text-muted" />
              <span className="min-w-0 flex-1 basis-40 truncate font-semibold">{f.name || t("pdfOld")}</span>
              <span className="text-muted">{t("pdfPages", { from: f.from, to: f.to, n: f.count })}</span>
              <button onClick={() => remove(f)} disabled={!!busy} className="icon-btn" aria-label={`${t("delete")} ${f.name || t("pdfOld")}`}>
                <I.IconTrash />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
