"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import * as I from "@/components/icons";
import { parseImport } from "./importText";

// picked: added from saved words, whose other fields were not loaded, so only what was edited is sent
type Img = { id: number; url: string };
// images: already on the saved word; files: chosen for a card that is not saved yet (uploaded after "Create")
type Row = { key: string; id?: number; term: string; meaningVi: string; ipa: string; pos: string; example: string; more?: boolean; picked?: string; images: Img[]; files: { url: string; file: File }[] };
type Saved = { id: number; term: string; meaningVi: string | null; definitionEn: string | null };
let seq = 0;
const blank = (): Row => ({ key: `n${seq++}`, term: "", meaningVi: "", ipa: "", pos: "", example: "", images: [], files: [] });

/** Create or edit a study set the Quizlet way: numbered term/definition cards, paste-import and saved-word picker. */
export default function SetEditor({
  initial,
  saved,
  textId,
}: {
  /** editing the word list of a reading text: its title is the text's, cards keep the text's order */
  textId?: number;
  initial?: { id: number; title: string; description: string | null; cards: { id: number; term: string; meaningVi: string | null; ipa: string | null; pos: string | null; example: string | null; images: Img[] }[] };
  saved: Saved[];
}) {
  const t = useTranslations("sets");
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    initial?.cards.length
      ? initial.cards.map((c) => ({ key: `w${c.id}`, id: c.id, term: c.term, meaningVi: c.meaningVi ?? "", ipa: c.ipa ?? "", pos: c.pos ?? "", example: c.example ?? "", images: c.images, files: [] }))
      : [blank(), blank(), blank()],
  );
  const [panel, setPanel] = useState<"import" | "pick" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const focusNext = useRef<string | null>(null);

  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (after?: string) => {
    const r = blank();
    focusNext.current = r.key;
    setRows((rs) => {
      const i = after ? rs.findIndex((x) => x.key === after) + 1 : rs.length;
      return [...rs.slice(0, i), r, ...rs.slice(i)];
    });
  };
  const move = (i: number, d: number) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const n = [...rs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const filled = rows.filter((r) => r.term.trim());

  async function save() {
    if (!title.trim()) return setError(true);
    setBusy(true);
    setError(false);
    const body = {
      title: title.trim(),
      description: description.trim(),
      cards: filled.map((r) =>
        r.picked !== undefined
          ? { id: r.id, term: r.term.trim(), ...(r.meaningVi !== r.picked && { meaningVi: r.meaningVi.trim() }), ...Object.fromEntries(Object.entries({ ipa: r.ipa.trim(), pos: r.pos.trim(), example: r.example.trim() }).filter(([, v]) => v)) }
          : { id: r.id, term: r.term.trim(), meaningVi: r.meaningVi.trim(), ipa: r.ipa.trim(), pos: r.pos.trim(), example: r.example.trim() },
      ),
    };
    const url = textId ? `/api/sets/text/${textId}` : initial ? `/api/sets/${initial.id}` : "/api/sets";
    const r = await fetch(url, { method: textId || initial ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!r?.ok) {
      setBusy(false);
      return setError(true);
    }
    const res = (await r.json()) as { id: number; wordIds: number[] };
    // images picked for new cards go to the words just created
    for (const [k, row] of filled.entries())
      for (const f of row.files) {
        const fd = new FormData();
        fd.set("file", f.file);
        await fetch(`/api/words/${res.wordIds[k]}/images`, { method: "POST", body: fd }).catch(() => null);
      }
    setBusy(false);
    router.push(textId ? `/words?src=text:${textId}` : `/words?src=set:${res.id}`);
    router.refresh();
  }

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-serif text-2xl font-bold md:text-3xl">{initial || textId ? t("editTitle") : t("newTitle")}</h1>
        <button onClick={save} disabled={busy} className="btn btn-primary">
          {busy ? t("saving") : initial || textId ? t("done") : t("create")}
        </button>
      </div>

      {textId ? (
        <p className="mt-3 text-lg font-semibold">
          {title} <span className="text-sm font-normal text-muted">· {t("fromText")}</span>
        </p>
      ) : (
      <div className="mt-6 space-y-4">
        <label className="block">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            className={`w-full border-b-2 bg-transparent pb-1.5 text-lg font-semibold outline-none transition-colors focus:border-accent ${error && !title.trim() ? "border-red-500" : "border-line"}`}
          />
          <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-muted">{t("titleLabel")}</span>
        </label>
        <label className="block">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("descPlaceholder")} className="w-full border-b-2 border-line bg-transparent pb-1.5 outline-none focus:border-accent" />
          <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-muted">{t("descLabel")}</span>
        </label>
      </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={() => setPanel(panel === "import" ? null : "import")} aria-pressed={panel === "import"} className={`btn btn-sm ${panel === "import" ? "btn-primary" : "btn-secondary"}`}>
          <I.IconPlus /> {t("import")}
        </button>
        <button onClick={() => setPanel(panel === "pick" ? null : "pick")} aria-pressed={panel === "pick"} className={`btn btn-sm ${panel === "pick" ? "btn-primary" : "btn-secondary"}`}>
          <I.IconWords /> {t("addSaved")}
        </button>
        <span className="ml-auto self-center text-sm text-muted">{t("terms", { n: filled.length })}</span>
      </div>
      {panel === "import" && (
        <ImportPanel
          onAdd={(cs) => {
            setRows((rs) => [...rs.filter((r) => r.term.trim() || r.meaningVi.trim()), ...cs.map((c) => ({ ...blank(), ...c }))]);
            setPanel(null);
          }}
        />
      )}
      {panel === "pick" && (
        <PickPanel
          saved={saved}
          chosen={new Set(rows.map((r) => r.id).filter(Boolean) as number[])}
          onAdd={(w) =>
            setRows((rs) => [...rs.filter((r) => r.term.trim() || r.meaningVi.trim()), { key: `w${w.id}`, id: w.id, term: w.term, meaningVi: w.meaningVi ?? "", ipa: "", pos: "", example: "", picked: w.meaningVi ?? "", images: [], files: [] }])
          }
        />
      )}

      <ol className="mt-5 space-y-4">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-2xl border border-line bg-card">
            <div className="flex items-center gap-1 border-b border-line px-4 py-2 text-sm">
              <span className="font-bold text-muted">{i + 1}</span>
              {r.id && <span className="ml-2 rounded bg-paper px-1.5 text-xs text-muted">{t("savedWord")}</span>}
              <span className="ml-auto flex gap-0.5">
                <button onClick={() => set(r.key, { more: !r.more })} className="icon-btn" aria-label={t("more")} title={t("more")}>
                  <I.IconEdit />
                </button>
                {!textId && (
                  <>
                    <button onClick={() => move(i, -1)} disabled={!i} className="icon-btn" aria-label={t("up")}>
                      <I.IconArrowUp />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="icon-btn" aria-label={t("down")}>
                      <I.IconArrowDown />
                    </button>
                  </>
                )}
                <button onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="icon-btn hover:text-red-600" aria-label={t(textId ? "removeFromText" : "removeCard")} title={t(textId ? "removeFromText" : "removeCard")}>
                  <I.IconTrash />
                </button>
              </span>
            </div>
            <div className="grid items-start gap-4 px-4 py-4 md:grid-cols-[1fr_1fr_9.5rem]">
              <Field label={t("term")} value={r.term} onChange={(v) => set(r.key, { term: v })} autoFocus={focusNext.current === r.key} />
              <Field
                label={t("definition")}
                value={r.meaningVi}
                onChange={(v) => set(r.key, { meaningVi: v })}
                // Tab on the last definition adds a new card, as in Quizlet
                onKeyDown={(e) => {
                  if (e.key === "Tab" && !e.shiftKey && i === rows.length - 1) {
                    e.preventDefault();
                    add();
                  }
                }}
              />
              <ImageSlot row={r} onChange={(patch) => set(r.key, patch)} />
              {r.more && (
                <>
                  <Field label={t("ipa")} value={r.ipa} onChange={(v) => set(r.key, { ipa: v })} />
                  <Field label={t("pos")} value={r.pos} onChange={(v) => set(r.key, { pos: v })} />
                  <div className="md:col-span-3">
                    <Field label={t("example")} value={r.example} onChange={(v) => set(r.key, { example: v })} />
                  </div>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
      <button onClick={() => add()} className="mt-4 flex min-h-16 w-full items-center justify-center rounded-2xl border-2 border-dashed border-line bg-card font-semibold text-muted transition-colors hover:border-accent hover:text-accent">
        + {t("addCard")}
      </button>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{title.trim() ? t("saveFailed") : t("needTitle")}</p>}
      <div className="mt-6 flex justify-end">
        <button onClick={save} disabled={busy} className="btn btn-lg btn-primary">
          {busy ? t("saving") : initial || textId ? t("done") : t("create")}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, onKeyDown, autoFocus }: { label: string; value: string; onChange: (v: string) => void; onKeyDown?: React.KeyboardEventHandler; autoFocus?: boolean }) {
  return (
    <label className="block">
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border-b-2 border-transparent bg-paper px-4 py-3 outline-none transition-colors focus:border-accent"
      />
      <span className="mt-1.5 block px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
    </label>
  );
}

/**
 * The picture of a card (Quizlet's "Image" box): click to choose, or paste / drop an image.
 * A saved word gets it at once; a new card keeps it until the set is created.
 */
function ImageSlot({ row, onChange }: { row: Row; onChange: (patch: Partial<Row>) => void }) {
  const t = useTranslations("sets");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function addFiles(list: File[]) {
    const files = list.filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    setFailed(false);
    if (!row.id) return onChange({ files: [...row.files, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))] });
    setBusy(true);
    const added: Img[] = [];
    for (const f of files) {
      const fd = new FormData();
      fd.set("file", f);
      const r = await fetch(`/api/words/${row.id}/images`, { method: "POST", body: fd }).catch(() => null);
      if (r?.ok) added.push(await r.json());
      else setFailed(true);
    }
    setBusy(false);
    onChange({ images: [...row.images, ...added] });
  }
  async function removeSaved(img: Img) {
    onChange({ images: row.images.filter((x) => x.id !== img.id) });
    await fetch(`/api/words/${row.id}/images/${img.id}`, { method: "DELETE" }).catch(() => null);
  }
  const shown = [...row.images.map((i) => ({ url: i.url, remove: () => removeSaved(i) })), ...row.files.map((f) => ({ url: f.url, remove: () => onChange({ files: row.files.filter((x) => x !== f) }) }))];
  return (
    <div
      className="flex gap-2 md:justify-end"
      onPaste={(e) => {
        const files = [...e.clipboardData.files];
        if (files.length) {
          e.preventDefault();
          addFiles(files);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        addFiles([...e.dataTransfer.files]);
      }}
    >
      {/* one thumbnail like Quizlet; "+n" when the word has more pictures */}
      {shown.slice(0, 1).map((im) => (
        <span key={im.url} className="group relative size-[4.5rem] flex-none overflow-hidden rounded-lg border border-line bg-paper">
          {shown.length > 1 && <span className="absolute bottom-1 left-1 rounded bg-card/90 px-1 text-[10px] font-bold">+{shown.length - 1}</span>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={im.url} alt="" className="size-full object-cover" />
          <button
            type="button"
            onClick={im.remove}
            aria-label={t("removeImage")}
            title={t("removeImage")}
            className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-card/90 text-ink shadow hover:text-red-600 [&_svg]:size-4"
          >
            <I.IconTrash />
          </button>
        </span>
      ))}
      <label
        tabIndex={0}
        title={t("imageHint")}
        className={`flex size-[4.5rem] flex-none cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs font-semibold transition-colors focus:border-accent focus:outline-none ${failed ? "border-red-400 text-red-600" : "border-line text-muted hover:border-accent hover:text-accent"}`}
      >
        <I.IconImage className="h-5 w-5" />
        {busy ? "…" : t("image")}
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple className="sr-only" onChange={(e) => (addFiles([...(e.target.files ?? [])]), (e.target.value = ""))} />
      </label>
    </div>
  );
}

function ImportPanel({ onAdd }: { onAdd: (cards: { term: string; meaningVi: string }[]) => void }) {
  const t = useTranslations("sets");
  const [text, setText] = useState("");
  const [sep, setSep] = useState<"tab" | "comma" | "dash">("tab");
  const cards = useMemo(() => parseImport(text, sep), [text, sep]);
  return (
    <div className="mt-3 rounded-2xl border border-line bg-card p-4">
      <p className="text-sm text-muted">{t("importHint")}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={t("importPlaceholder")} className="field mt-2 w-full py-2 font-mono text-sm" />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{t("between")}</span>
        {(["tab", "comma", "dash"] as const).map((s) => (
          <button key={s} onClick={() => setSep(s)} className={`chip ${sep === s ? "chip-on" : ""}`}>
            {t(`sep.${s}`)}
          </button>
        ))}
        <button onClick={() => onAdd(cards)} disabled={!cards.length} className="btn btn-sm btn-primary ml-auto">
          {t("importN", { n: cards.length })}
        </button>
      </div>
    </div>
  );
}

function PickPanel({ saved, chosen, onAdd }: { saved: Saved[]; chosen: Set<number>; onAdd: (w: Saved) => void }) {
  const t = useTranslations("sets");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? saved.filter((w) => w.term.toLowerCase().includes(s) || (w.meaningVi ?? "").toLowerCase().includes(s)) : saved).slice(0, 60);
  }, [saved, q]);
  return (
    <div className="mt-3 rounded-2xl border border-line bg-card p-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchSaved")} className="field w-full" autoFocus />
      <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto">
        {list.map((w) => {
          const on = chosen.has(w.id);
          return (
            <li key={w.id}>
              <button onClick={() => !on && onAdd(w)} disabled={on} className="flex w-full items-center gap-3 px-2 py-2 text-left text-sm hover:bg-paper disabled:opacity-50">
                <b className="w-1/3 truncate">{w.term}</b>
                <span className="flex-1 truncate text-muted">{w.meaningVi || w.definitionEn}</span>
                <span className="flex-none text-accent">{on ? <I.IconCheck className="h-4 w-4" /> : <I.IconPlus className="h-4 w-4" />}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
