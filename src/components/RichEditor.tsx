"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { segments } from "@/components/lesson/marks";
import { escapeMd, parseRich } from "@/lib/text/rich";

/* ---------- markdown ↔ HTML (the editor stores the lightweight markdown of lib/text/rich) ---------- */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const okSrc = (s: string) => /^(https?:\/\/|\/api\/images\/|data:image\/(png|jpe?g|gif|webp);)/i.test(s);

export function mdToHtml(md: string): string {
  return md
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      if (/^-{3,}$/.test(b)) return "<hr>";
      const p = parseRich(b);
      if (p.kind === "img") return okSrc(p.src ?? "") ? `<p><img src="${esc(p.src!)}" alt="${esc(p.alt ?? "")}"></p>` : "";
      const marks = p.styles.map((s) => ({ start: s.start, end: s.end, kind: "fmt" as const, id: 0, color: s.kind }));
      const html = segments(p.text, marks)
        .map((seg) => {
          let h = esc(seg.text);
          if (seg.marks.some((m) => m.color === "i")) h = `<em>${h}</em>`;
          if (seg.marks.some((m) => m.color === "b")) h = `<strong>${h}</strong>`;
          return h;
        })
        .join("");
      return p.kind === "h" ? `<h3>${html}</h3>` : `<p>${html}</p>`;
    })
    .join("");
}

const BLOCK = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "UL", "OL", "TR", "TABLE", "SECTION", "ARTICLE", "FIGURE", "FIGCAPTION", "PRE"]);

function wrap(inner: string, mark: string) {
  const t = inner.trim();
  if (!t) return inner;
  return inner.slice(0, inner.length - inner.trimStart().length) + mark + t + mark + inner.slice(inner.trimEnd().length);
}

export function htmlToMd(root: Node): string {
  const out: string[] = [];
  let cur = "";
  let heading = false;
  const flush = () => {
    const t = cur.replace(/\s+/g, " ").trim();
    if (t) out.push(heading && !t.startsWith("# ") ? `# ${t}` : t);
    cur = "";
    heading = false;
  };
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      cur += (n.textContent ?? "").replace(/\\/g, "\\\\").replace(/\*/g, "\\*");
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as HTMLElement;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "HEAD") return;
    if (tag === "BR") return flush();
    if (tag === "HR") {
      flush();
      out.push("---");
      return;
    }
    if (tag === "IMG") {
      flush();
      const src = el.getAttribute("src") ?? "";
      if (okSrc(src)) out.push(`![${(el.getAttribute("alt") ?? "").replace(/[\]\n]/g, " ")}](${src.replace(/[()\s]/g, encodeURIComponent)})`);
      return;
    }
    const block = BLOCK.has(tag);
    if (block) flush();
    if (/^H[1-6]$/.test(tag)) heading = true;
    const w = el.style?.fontWeight ?? "";
    const bold = (tag === "STRONG" || (tag === "B" && !/^(normal|400)$/.test(w))) || /^(bold|[6-9]00)$/.test(w);
    const ital = tag === "EM" || tag === "I" || el.style?.fontStyle === "italic";
    const start = cur.length;
    el.childNodes.forEach(walk);
    if ((bold || ital) && !block && cur.length >= start) {
      const inner = cur.slice(start);
      cur = cur.slice(0, start) + wrap(inner, bold && ital ? "***" : bold ? "**" : "*");
    }
    if (block) flush();
  };
  root.childNodes.forEach(walk);
  flush();
  return out.join("\n\n");
}

async function upload(file: Blob): Promise<string | null> {
  const f = new FormData();
  f.set("file", file);
  const r = await fetch("/api/images", { method: "POST", body: f }).catch(() => null);
  return r?.ok ? ((await r.json()) as { url: string }).url : null;
}

/** Upload pasted `data:` images and swap in their server URLs (data URLs would bloat the database). */
async function resolveDataImages(md: string): Promise<string> {
  const found = [...md.matchAll(/!\[[^\]]*\]\((data:image\/[^)\s]+)\)/g)].map((m) => m[1]);
  for (const d of new Set(found)) {
    const url = await fetch(d).then((r) => r.blob()).then(upload).catch(() => null);
    md = md.split(d).join(url ?? "");
  }
  return md.replace(/!\[[^\]]*\]\(\)/g, "");
}

function plainToMd(t: string): string {
  t = t.replace(/\r/g, "").trim();
  const paras = /\n\s*\n/.test(t) ? t.split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, " ")) : t.split("\n");
  return paras.map((p) => escapeMd(p.trim())).filter(Boolean).join("\n\n");
}

/** WYSIWYG editor: bold, italic, UPPER/lower case, heading, images (paste, drop or upload) and a lesson-split line. `value` is read once. */
export default function RichEditor({ value, onChange, placeholder, className = "" }: { value: string; onChange: (md: string) => void; placeholder?: string; className?: string }) {
  const t = useTranslations("editor");
  const ref = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(!value.trim());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = mdToHtml(value);
    document.execCommand("defaultParagraphSeparator", false, "p");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = () => {
    const el = ref.current!;
    setEmpty(!el.textContent?.trim() && !el.querySelector("img,hr"));
    onChange(htmlToMd(el));
  };
  const cmd = (c: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(c, false, arg);
    sync();
  };
  const insertMd = (md: string) => md && cmd("insertHTML", mdToHtml(md));
  const recase = (fn: (s: string) => string) => {
    const s = window.getSelection()?.toString();
    if (s) cmd("insertText", fn(s));
  };
  const heading = () => cmd("formatBlock", document.queryCommandValue("formatBlock").toLowerCase() === "h3" ? "p" : "h3");

  async function addImages(files: File[]) {
    setError("");
    for (const f of files) {
      const url = await upload(f);
      if (url) insertMd(`![](${url})`);
      else setError(t("uploadFailed"));
    }
  }

  async function onPaste(e: React.ClipboardEvent) {
    const cd = e.clipboardData;
    const html = cd.getData("text/html");
    const files = [...cd.files].filter((f) => f.type.startsWith("image/"));
    const text = cd.getData("text/plain");
    e.preventDefault();
    if (html) {
      const md = await resolveDataImages(htmlToMd(new DOMParser().parseFromString(html, "text/html").body));
      insertMd(md);
      if (files.length && !/!\[/.test(md)) await addImages(files);
    } else if (files.length) await addImages(files);
    else insertMd(plainToMd(text));
  }

  const btn = "min-h-9 min-w-9 rounded-lg border border-line bg-card px-2 text-sm hover:bg-paper";
  const tool = (label: string, title: string, run: () => void, cls = "") => (
    <button type="button" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={run} className={`${btn} ${cls}`}>
      {label}
    </button>
  );

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap gap-1">
        {tool("B", t("bold"), () => cmd("bold"), "font-bold")}
        {tool("I", t("italic"), () => cmd("italic"), "italic")}
        {tool("AA", t("upper"), () => recase((s) => s.toUpperCase()))}
        {tool("aa", t("lower"), () => recase((s) => s.toLowerCase()))}
        {tool("H", t("heading"), heading, "font-bold")}
        {tool("🖼", t("image"), () => fileInput.current?.click())}
        {tool("✂ ---", t("split"), () => cmd("insertHTML", "<hr><p><br></p>"))}
        {tool("↶", t("undo"), () => cmd("undo"))}
        {tool("↷", t("redo"), () => cmd("redo"))}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            addImages([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="relative">
        {empty && placeholder && <div className="pointer-events-none absolute left-3 top-3 text-muted">{placeholder}</div>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline
          onInput={sync}
          onPaste={onPaste}
          onDrop={(e) => {
            const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
            if (!files.length) return;
            e.preventDefault();
            addImages(files);
          }}
          className="min-h-56 overflow-y-auto rounded-xl border border-line bg-card p-3 font-serif text-base leading-relaxed outline-none focus:border-accent [&_h3]:my-3 [&_h3]:font-sans [&_h3]:text-lg [&_h3]:font-bold [&_hr]:my-4 [&_hr]:border-dashed [&_hr]:border-accent [&_img]:mx-auto [&_img]:my-3 [&_img]:max-h-72 [&_img]:max-w-full [&_img]:rounded-lg [&_p]:mb-3"
        />
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
