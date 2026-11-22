"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

export type ExportWord = { term: string; ipa: string | null; pos: string | null; meaningVi: string | null; definitionEn: string | null; example: string | null };
export type ExportGroup = { key: string; doc: string; part: string | null; words: ExportWord[] };
type Format = "anki" | "quizlet" | "csv";

const flat = (s: string | null) => (s ?? "").replace(/[\t\r\n]+/g, " ").trim();
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); // HTML-safe, and no bare quotes that Anki would read as CSV quoting
const tag = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "");
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** File text for each format. Anki reads the "#" header lines (Anki 2.1.55+); Quizlet takes "term<TAB>definition" lines. */
export function buildExport(groups: ExportGroup[], format: Format) {
  const rows = groups.flatMap((g) => g.words.map((w) => ({ w, g })));
  if (format === "csv")
    return (
      "﻿" + // BOM so Excel opens Vietnamese text correctly
      [["term", "ipa", "pos", "meaning_vi", "definition_en", "example", "source"], ...rows.map(({ w, g }) => [w.term, w.ipa, w.pos, w.meaningVi, w.definitionEn, w.example, [g.doc, g.part].filter(Boolean).join(" · ")])]
        .map((r) => r.map((c) => csvCell((c ?? "").trim())).join(","))
        .join("\n")
    );
  if (format === "quizlet")
    return rows
      .map(({ w }) => {
        const head = [w.pos, w.ipa].map(flat).filter(Boolean).join(" ");
        const def = [head && `(${head})`, flat(w.meaningVi) || flat(w.definitionEn), w.example && `— ${flat(w.example)}`].filter(Boolean).join(" ");
        return `${flat(w.term)}\t${def}`;
      })
      .join("\n");
  const lines = rows.map(({ w, g }) => {
    const back = [
      [w.pos && `<i>${esc(flat(w.pos))}</i>`, w.ipa && esc(flat(w.ipa))].filter(Boolean).join(" "),
      w.meaningVi && `<b>${esc(flat(w.meaningVi))}</b>`,
      w.definitionEn && esc(flat(w.definitionEn)),
      w.example && `<i>${esc(flat(w.example))}</i>`,
    ].filter(Boolean);
    return [esc(flat(w.term)), back.join("<br>"), tag(g.doc) || "gainee"].join("\t");
  });
  return ["#separator:tab", "#html:true", "#columns:Front\tBack\tTags", "#tags column:3", ...lines].join("\n");
}

/** Pick parts of the word list and download them for Anki / Quizlet / a spreadsheet. */
export default function ExportWords({ groups }: { groups: ExportGroup[] }) {
  const t = useTranslations("wordList.export");
  const [on, setOn] = useState(() => new Set(groups.map((g) => g.key)));
  const [format, setFormat] = useState<Format>("anki");
  const [copied, setCopied] = useState(false);
  const chosen = useMemo(() => groups.filter((g) => on.has(g.key)), [groups, on]);
  const n = chosen.reduce((a, g) => a + g.words.length, 0);
  const docs = [...new Set(groups.map((g) => g.doc))];

  const toggle = (keys: string[], value: boolean) =>
    setOn((s) => {
      const next = new Set(s);
      for (const k of keys) {
        if (value) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  function download() {
    const text = buildExport(chosen, format);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: format === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8" }));
    a.download = `gainee-words-${new Date().toISOString().slice(0, 10)}.${format === "csv" ? "csv" : "txt"}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function copy() {
    await navigator.clipboard.writeText(buildExport(chosen, format));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <details className="mt-3 rounded-xl border border-line bg-card">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">{t("open")}</summary>
      <div className="space-y-4 border-t border-line p-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold">{t("parts")}</span>
            <button type="button" className="text-accent underline" onClick={() => toggle(groups.map((g) => g.key), true)}>
              {t("all")}
            </button>
            <button type="button" className="text-accent underline" onClick={() => toggle(groups.map((g) => g.key), false)}>
              {t("none")}
            </button>
          </div>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {docs.map((doc) => {
              const parts = groups.filter((g) => g.doc === doc);
              const keys = parts.map((g) => g.key);
              const all = keys.every((k) => on.has(k));
              return (
                <div key={doc}>
                  <label className="flex items-center gap-2 font-medium">
                    <input type="checkbox" checked={all} onChange={(e) => toggle(keys, e.target.checked)} />
                    {doc} <span className="text-sm font-normal text-muted">({parts.reduce((a, g) => a + g.words.length, 0)})</span>
                  </label>
                  {parts.some((g) => g.part) && (
                    <div className="ml-6 mt-1 flex flex-col gap-1 text-sm">
                      {parts.map((g) => (
                        <label key={g.key} className="flex items-center gap-2">
                          <input type="checkbox" checked={on.has(g.key)} onChange={(e) => toggle([g.key], e.target.checked)} />
                          {g.part} <span className="text-muted">({g.words.length})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold">{t("format")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["anki", "quizlet", "csv"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFormat(f)} aria-pressed={format === f} className={`chip ${format === f ? "chip-on" : ""}`}>
                {t(`formats.${f}`)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">{t(`hint.${format}`)}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={!n} onClick={download}>
            {t("download", { n })}
          </button>
          {format === "quizlet" && (
            <button type="button" className="btn btn-secondary" disabled={!n} onClick={copy}>
              {copied ? t("copied") : t("copy")}
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
