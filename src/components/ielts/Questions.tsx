"use client";

import { Fragment } from "react";
import { numbersOfGroup, splitBlanks, type Group, type Item, type SectionContent } from "@/lib/ielts/types";
import * as I from "@/components/icons";

export type QProps = {
  content: SectionContent;
  /** section id: answers are stored as "<sid>:<n>" */
  sid: number;
  values: Record<string, string>;
  onChange?: (key: string, value: string) => void;
  /** after marking: n → right? and the answer key */
  marks?: Record<number, boolean>;
  keys?: Record<string, string>;
  /** practice of one question group only */
  only?: number;
  onExplain?: (n: number) => void;
  explainLabel?: string;
};

const TF = { tfng: ["TRUE", "FALSE", "NOT GIVEN"], ynng: ["YES", "NO", "NOT GIVEN"] } as const;

/** Small result badge after marking: ✓, or ✗ with the right answer. */
function Mark({ n, p }: { n: number; p: QProps }) {
  if (!p.marks || !(n in p.marks)) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-1 align-middle text-sm">
      {p.marks[n] ? <I.IconCheck className="h-4 w-4 text-green-600" /> : <I.IconX className="h-4 w-4 text-red-600" />}
      {!p.marks[n] && <b className="text-green-700 dark:text-green-400">{p.keys?.[n]}</b>}
      {p.onExplain && (
        <button type="button" onClick={() => p.onExplain!(n)} className="ml-1 rounded-md px-1.5 text-xs font-semibold text-accent underline-offset-2 hover:underline">
          {p.explainLabel}
        </button>
      )}
    </span>
  );
}

const ring = (p: QProps, n: number) => (!p.marks || !(n in p.marks) ? "" : p.marks[n] ? "!border-green-500" : "!border-red-500");

function Blank({ n, p }: { n: number; p: QProps }) {
  const k = `${p.sid}:${n}`;
  return (
    <span id={`q-${p.sid}-${n}`} className="mx-0.5 inline-flex items-center whitespace-nowrap">
      <input
        value={p.values[k] ?? ""}
        onChange={(e) => p.onChange?.(k, e.target.value)}
        readOnly={!p.onChange}
        placeholder={String(n)}
        aria-label={`Question ${n}`}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className={`h-8 w-36 rounded border-2 border-ink/30 bg-card px-2 text-center font-semibold text-ink outline-none placeholder:font-bold placeholder:text-ink/50 focus:border-accent ${ring(p, n)}`}
      />
      <Mark n={n} p={p} />
    </span>
  );
}

/** Notes / form / table / summary with [[n]] blanks. */
function GapText({ text, p }: { text: string; p: QProps }) {
  const inline = (s: string) => splitBlanks(s).map((x, i) => (typeof x === "number" ? <Blank key={i} n={x} p={p} /> : <Fragment key={i}>{x.replace(/\*\*/g, "")}</Fragment>));
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      out.push(
        <div key={i} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-[0.95em]">
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className={`border border-ink/25 px-2 py-1.5 align-top leading-9 ${ri === 0 ? "bg-ink/5 font-bold" : ""}`}>
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (line.startsWith("#")) out.push(<p key={i} className="mt-3 font-bold">{inline(line.replace(/^#+\s*/, ""))}</p>);
    else if (/^[-•–]\s/.test(line))
      out.push(
        <p key={i} className="ml-5 list-item list-disc leading-10">
          {inline(line.replace(/^[-•–]\s*/, ""))}
        </p>,
      );
    else out.push(<p key={i} className="leading-10">{inline(line)}</p>);
  }
  return <div>{out}</div>;
}

/** Numbers whose blank is not written in the text (they are only on the picture, e.g. notes kept as an image): one box each. */
function PictureBlanks({ g, p }: { g: Group; p: QProps }) {
  const inText = new Set(splitBlanks(g.text ?? "").filter((x) => typeof x === "number"));
  const rest = numbersOfGroup(g).filter((n) => !inText.has(n));
  if (!rest.length) return null;
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {rest.map((n) => (
        <div key={n} className="flex items-center gap-2">
          <b className="w-6 text-right">{n}</b>
          <Blank n={n} p={p} />
        </div>
      ))}
    </div>
  );
}

function Choice({ item, p, multi }: { item: Item; p: QProps; multi: boolean }) {
  const keys = item.n.map((n) => `${p.sid}:${n}`);
  const picked = keys.map((k) => p.values[k]).filter(Boolean);
  const toggle = (key: string) => {
    if (!p.onChange) return;
    if (!multi) return p.onChange(keys[0], key);
    let next = picked.includes(key) ? picked.filter((x) => x !== key) : [...picked, key];
    if (next.length > item.n.length) next = next.slice(1);
    next.sort();
    keys.forEach((k, i) => p.onChange!(k, next[i] ?? ""));
  };
  return (
    <div id={`q-${p.sid}-${item.n[0]}`} className="mb-4">
      <p className="font-medium">
        <b className="mr-2">{item.n.length > 1 ? `${item.n[0]}–${item.n[item.n.length - 1]}` : item.n[0]}</b>
        {item.q}
        {item.n.map((n) => (
          <Mark key={n} n={n} p={p} />
        ))}
      </p>
      <ItemImage src={item.image} />
      <div className="mt-1.5 space-y-1">
        {(item.options ?? []).map((o) => {
          const on = picked.includes(o.key);
          return (
            <label key={o.key} className={`flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1 hover:bg-ink/5 ${on ? "bg-accent/10" : ""}`}>
              <input type={multi ? "checkbox" : "radio"} name={keys.join("_")} checked={on} onChange={() => toggle(o.key)} disabled={!p.onChange} className="mt-1 size-4 accent-[var(--accent)]" />
              <span>
                <b className="mr-1.5">{o.key}</b>
                {o.text}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function Statement({ item, p, labels }: { item: Item; p: QProps; labels: readonly string[] }) {
  const n = item.n[0];
  const k = `${p.sid}:${n}`;
  return (
    <div id={`q-${p.sid}-${n}`} className="mb-4">
      <p>
        <b className="mr-2">{n}</b>
        {item.q}
        <Mark n={n} p={p} />
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {labels.map((l) => (
          <label key={l} className={`cursor-pointer rounded-md border-2 px-3 py-1 text-sm font-semibold ${p.values[k] === l ? "border-accent bg-accent/10" : "border-ink/20 hover:border-ink/40"}`}>
            <input type="radio" name={k} className="sr-only" checked={p.values[k] === l} onChange={() => p.onChange?.(k, l)} disabled={!p.onChange} />
            {l}
          </label>
        ))}
      </div>
    </div>
  );
}

function Match({ g, p }: { g: Group; p: QProps }) {
  return (
    <>
      {!!g.options?.length && (
        <div className="mb-4 rounded-md border-2 border-ink/20 p-3">
          {g.optionsTitle && <p className="mb-1 font-bold">{g.optionsTitle}</p>}
          {g.options.map((o) => (
            <p key={o.key} className="flex gap-2">
              <b className="w-8 flex-none">{o.key}</b>
              <span>{o.text}</span>
            </p>
          ))}
        </div>
      )}
      {(g.items ?? []).map((it) => {
        const n = it.n[0];
        const k = `${p.sid}:${n}`;
        return (
          <div key={n} id={`q-${p.sid}-${n}`} className="mb-3 flex flex-wrap items-center gap-2">
            <b>{n}</b>
            <span className="min-w-0 flex-1">
              {it.q}
              <ItemImage src={it.image} />
            </span>
            <select value={p.values[k] ?? ""} onChange={(e) => p.onChange?.(k, e.target.value)} disabled={!p.onChange} aria-label={`Question ${n}`} className={`h-9 rounded border-2 border-ink/30 bg-card px-2 font-semibold ${ring(p, n)}`}>
              <option value="" />
              {(g.options ?? []).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.key}
                </option>
              ))}
            </select>
            <Mark n={n} p={p} />
          </div>
        );
      })}
    </>
  );
}

/** Picture belonging to one question (a bar chart whose columns are the options…). */
function ItemImage({ src }: { src?: string }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="my-2 block max-h-80 max-w-full rounded border border-ink/10 bg-white object-contain" />;
}

export function GroupView({ g, p }: { g: Group; p: QProps }) {
  return (
    <section className="mb-8">
      <h3 className="font-bold">Questions {g.from === g.to ? g.from : `${g.from}–${g.to}`}</h3>
      <p className="mt-1 whitespace-pre-line">{g.instructions}</p>
      {g.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={g.image} alt="" className="my-3 max-h-[28rem] max-w-full rounded border border-ink/10 bg-white object-contain" />
      )}
      <div className="mt-3">
        {g.type === "gap" && <GapText text={g.text ?? ""} p={p} />}
        {g.type === "gap" && <PictureBlanks g={g} p={p} />}
        {(g.type === "mcq" || g.type === "multi") && (g.items ?? []).map((it) => <Choice key={it.n[0]} item={it} p={p} multi={it.n.length > 1} />)}
        {(g.type === "tfng" || g.type === "ynng") && (g.items ?? []).map((it) => <Statement key={it.n[0]} item={it} p={p} labels={TF[g.type as "tfng"]} />)}
        {g.type === "match" && <Match g={g} p={p} />}
      </div>
    </section>
  );
}

export default function Questions(p: QProps) {
  return (
    <div>
      {p.content.groups.map((g, i) => (p.only === undefined || p.only === i ? <GroupView key={i} g={g} p={p} /> : null))}
    </div>
  );
}

/** Reading passage: "# Title", paragraphs split by blank lines, "**A**" paragraph letters. */
export function Passage({ text, intro }: { text: string; intro?: string }) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div>
      {intro && <p className="mb-3 text-[0.95em] italic">{intro}</p>}
      {blocks.map((b, i) => {
        if (b.startsWith("#")) return <h2 key={i} className="mb-3 text-[1.35em] font-bold">{b.replace(/^#+\s*/, "")}</h2>;
        const m = b.match(/^\*\*([A-Z])\*\*\s*/);
        return (
          <p key={i} className="mb-4 leading-relaxed">
            {m && <b className="mr-2">{m[1]}</b>}
            {(m ? b.slice(m[0].length) : b).replace(/\*\*/g, "")}
          </p>
        );
      })}
    </div>
  );
}
