"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import LabelPicker from "@/components/labels/LabelPicker";
import RichEditor from "@/components/RichEditor";
import * as I from "@/components/icons";

type Preview = {
  title: string;
  author: string | null;
  paragraphs: number;
  words: number;
  sample: string[];
  lessons: { words: number; start: string }[];
};

export default function ImportForm({ sources }: { sources: string[] }) {
  const t = useTranslations("import");
  const router = useRouter();
  const [mode, setMode] = useState<"paste" | "file">("file");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [source, setSource] = useState("");
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "create">("");
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function form() {
    const f = new FormData();
    if (mode === "file" && file) f.set("file", file);
    else {
      f.set("text", text);
      f.set("rich", "1"); // paragraphs, formatting, images and "---" lesson breaks come from the editor
    }
    f.set("title", title);
    f.set("author", author);
    f.set("source", source);
    f.set("labelIds", JSON.stringify(labelIds));
    return f;
  }

  async function send(kind: "preview" | "create") {
    setBusy(kind);
    setError("");
    const r = await fetch(kind === "preview" ? "/api/documents/preview" : "/api/documents", { method: "POST", body: form() });
    const data = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setError(t.has(`errors.${data.error}`) ? t(`errors.${data.error}`) : t("errors.unknown"));
    if (kind === "preview") {
      setPreview(data);
      if (!title && data.title) setTitle(data.title);
      if (!author && data.author) setAuthor(data.author);
    } else router.push(`/library/${data.id}`);
  }

  const ready = mode === "file" ? !!file : text.trim().length > 0;
  const field = "w-full rounded-xl border border-line bg-card px-3 py-2.5 text-base outline-none focus:border-accent";

  return (
    <div className="space-y-5">
      <div role="tablist" className="inline-flex rounded-xl border border-line bg-card p-1">
        {(["file", "paste"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setPreview(null);
            }}
            className={`btn btn-sm ${mode === m ? "bg-card text-ink shadow-sm" : "btn-ghost"}`}
          >
            {t(`mode.${m}`)}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) {
              setFile(f);
              setPreview(null);
            }
          }}
          onClick={() => fileInput.current?.click()}
          className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center ${drag ? "border-accent bg-accent/5" : "border-line bg-card"}`}
        >
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
          />
          <I.IconFile className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-2 font-medium">{file ? file.name : t("drop")}</p>
          <p className="text-sm text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : t("formats")}</p>
        </div>
      ) : (
        <RichEditor
          value={text}
          onChange={(md) => {
            setText(md);
            setPreview(null);
          }}
          placeholder={t("pastePlaceholder")}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm sm:col-span-3">
          <span className="text-muted">{t("title")}</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titleHint")} maxLength={500} />
        </label>
        <label className="text-sm">
          <span className="text-muted">{t("author")}</span>
          <input className={field} value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={255} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-muted">{t("source")}</span>
          <input className={field} value={source} onChange={(e) => setSource(e.target.value)} placeholder={t("sourceHint")} list="sources" maxLength={1000} />
          <datalist id="sources">{sources.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
      </div>

      <div>
        <p className="mb-2 text-sm text-muted">{t("labels")}</p>
        <LabelPicker value={labelIds} onChange={setLabelIds} />
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {preview && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="font-medium">{t("previewSummary", { words: preview.words, paragraphs: preview.paragraphs, lessons: preview.lessons.length })}</p>
          <ol className="mt-3 space-y-1 text-sm">
            {preview.lessons.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-28 flex-none whitespace-nowrap text-muted">
                  {t("part", { n: i + 1 })} · {l.words}
                </span>
                <span className="truncate font-serif">{l.start}…</span>
              </li>
            ))}
          </ol>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">{t("sample")}</summary>
            <div className="mt-2 space-y-2 font-serif">
              {preview.sample.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </details>
          <p className="mt-3 text-xs text-muted">{t("aiNote")}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button disabled={!ready || !!busy} onClick={() => send("preview")} className="btn btn-secondary">
          {busy === "preview" ? t("reading") : t("preview")}
        </button>
        <button disabled={!ready || !!busy} onClick={() => send("create")} className="btn btn-primary">
          {busy === "create" ? t("creating") : t("create")}
        </button>
      </div>
    </div>
  );
}
