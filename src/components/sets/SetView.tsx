"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import ExportWords from "@/components/ExportWords";
import Flashcards from "@/components/practice/Flashcards";
import Learn from "@/components/practice/Learn";
import Match from "@/components/practice/Match";
import Quiz from "@/components/practice/Quiz";
import { meaningOf, shuffle, type PWord } from "@/components/practice/questions";
import { speak } from "@/lib/speech";
import * as I from "@/components/icons";

export type SetCardData = PWord & { example: string | null; note: string | null; state: number };
type Mode = "cards" | "learn" | "test" | "match";
const MODES: { m: Mode; icon: React.ReactNode }[] = [
  { m: "cards", icon: <I.IconCards /> },
  { m: "learn", icon: <I.IconTarget /> },
  { m: "test", icon: <I.IconChecklist /> },
  { m: "match", icon: <I.IconSpark /> },
];

/**
 * A study set laid out like a Quizlet set page: study modes, a flashcard viewer, then every term
 * with its meaning, editable in place.
 */
export default function SetView({
  title,
  description,
  cards: initial,
  all,
  setId,
  docId,
}: {
  title: string;
  description?: string | null;
  cards: SetCardData[];
  all: { term: string; meaning: string }[];
  setId?: number;
  docId?: number;
}) {
  const t = useTranslations("sets");
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [mode, setMode] = useState<Mode | null>(null);
  const [sort, setSort] = useState<"set" | "az" | "weak">("set");
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => {
    const l = [...cards];
    if (sort === "az") l.sort((a, b) => a.term.localeCompare(b.term));
    if (sort === "weak") l.sort((a, b) => (b.lapses ?? 0) - (a.lapses ?? 0) || (a.reps ?? 0) - (b.reps ?? 0));
    return l;
  }, [cards, sort]);

  if (mode) {
    const exit = () => setMode(null);
    return (
      <div>
        <button onClick={exit} className="btn btn-sm btn-ghost mb-4">
          ← {title}
        </button>
        {mode === "cards" && <Flashcards words={cards} onExit={exit} />}
        {mode === "learn" && <Learn words={cards} all={all} onExit={exit} />}
        {mode === "test" && <Quiz words={shuffle(cards)} all={all} mode="mix" onExit={exit} />}
        {mode === "match" && <Match words={cards} onExit={exit} />}
      </div>
    );
  }

  async function copyToSet() {
    setBusy(true);
    const r = await fetch("/api/sets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, wordIds: cards.map((c) => c.id) }) });
    setBusy(false);
    if (r.ok) router.push(`/words/sets/${(await r.json()).id}/edit`);
  }
  async function remove() {
    if (!setId || !confirm(t("deleteConfirm", { title }))) return;
    await fetch(`/api/sets/${setId}`, { method: "DELETE" });
    router.push("/words");
    router.refresh();
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{title}</h1>
      <p className="mt-1 text-sm text-muted">
        {t("terms", { n: cards.length })}
        {docId && (
          <>
            {" · "}
            <Link href={`/library/${docId}`} className="underline">
              {t("fromText")}
            </Link>
          </>
        )}
      </p>
      {description && <p className="mt-2 max-w-2xl text-muted">{description}</p>}

      {cards.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center">
          <p className="text-muted">{t("emptySet")}</p>
          {setId && (
            <Link href={`/words/sets/${setId}/edit`} className="btn btn-primary mt-3">
              {t("addTerms")}
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {MODES.map(({ m, icon }) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="flex items-center gap-3 rounded-xl border-2 border-line bg-card px-4 py-3 text-left font-semibold transition-colors hover:border-accent/60 [&_svg]:size-5"
              >
                <span className="text-accent">{icon}</span>
                {t(`mode.${m}`)}
              </button>
            ))}
          </div>
          <Viewer cards={cards} />
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-y border-line py-3">
        {setId ? (
          <Link href={`/words/sets/${setId}/edit`} className="btn btn-sm btn-secondary">
            <I.IconEdit /> {t("edit")}
          </Link>
        ) : (
          <button onClick={copyToSet} disabled={busy} className="btn btn-sm btn-secondary">
            <I.IconPlus /> {t("makeSet")}
          </button>
        )}
        {setId && (
          <button onClick={remove} className="btn btn-sm btn-danger">
            <I.IconTrash /> {t("delete")}
          </button>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t("sortLabel")} className="field field-sm ml-auto w-auto">
          {(["set", "az", "weak"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`sort.${s}`)}
            </option>
          ))}
        </select>
      </div>
      {cards.length > 0 && (
        <ExportWords groups={[{ key: "set", doc: title, part: null, words: cards }]} />
      )}

      <h2 className="mt-6 font-serif text-xl font-bold">{t("termsTitle", { n: cards.length })}</h2>
      <ul className="mt-3 space-y-2">
        {shown.map((c) => (
          <TermRow key={c.id} card={c} onSaved={(n) => setCards((cs) => cs.map((x) => (x.id === n.id ? n : x)))} />
        ))}
      </ul>
      {setId && (
        <div className="mt-4 text-center">
          <Link href={`/words/sets/${setId}/edit`} className="btn btn-secondary">
            {t("addOrRemove")}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Flashcard viewer on the set page: click to flip, arrows to move, as on a Quizlet set. */
function Viewer({ cards }: { cards: SetCardData[] }) {
  const t = useTranslations("sets");
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const c = cards[Math.min(i, cards.length - 1)];
  const go = (d: number) => {
    setFlip(false);
    setI((n) => (n + d + cards.length) % cards.length);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,button")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setFlip((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!c) return null;
  const face = "absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-line bg-card p-6 text-center shadow-sm [backface-visibility:hidden]";
  return (
    <div className="mt-5">
      <button onClick={() => setFlip(!flip)} className="relative block h-72 w-full [perspective:1200px] md:h-80" aria-label={t("flip")}>
        <span className={`absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d] ${flip ? "[transform:rotateY(180deg)]" : ""}`}>
          <span className={face}>
            <span className="font-serif text-4xl font-bold">{c.term}</span>
            {c.ipa && <span className="mt-2 text-muted">{c.ipa}</span>}
          </span>
          <span className={`${face} [transform:rotateY(180deg)]`}>
            {c.images?.[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.images[0].url} alt="" className="mb-3 max-h-36 max-w-[60%] rounded-lg object-contain" />
            )}
            <span className="text-2xl font-semibold">{meaningOf(c) || "—"}</span>
            {c.example && <span className="mt-3 max-w-lg font-serif italic text-muted">“{c.example}”</span>}
          </span>
        </span>
      </button>
      <div className="mt-3 flex items-center justify-center gap-4">
        <button onClick={() => go(-1)} className="icon-btn icon-btn-outline rounded-full" aria-label={t("prev")}>
          ←
        </button>
        <span className="min-w-16 text-center text-sm font-semibold tabular-nums">
          {i + 1} / {cards.length}
        </span>
        <button onClick={() => go(1)} className="icon-btn icon-btn-outline rounded-full" aria-label={t("next")}>
          →
        </button>
        <button onClick={() => speak(c.term)} className="icon-btn" aria-label={t("listen")}>
          <I.IconSpeaker />
        </button>
      </div>
    </div>
  );
}

/** A term and its meaning side by side; the pencil edits both in place. */
function TermRow({ card, onSaved }: { card: SetCardData; onSaved: (c: SetCardData) => void }) {
  const t = useTranslations("sets");
  const [edit, setEdit] = useState<{ term: string; meaningVi: string } | null>(null);
  async function save() {
    if (!edit?.term.trim()) return;
    const r = await fetch(`/api/words/${card.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ term: edit.term.trim(), meaningVi: edit.meaningVi.trim() }) });
    if (r.ok) {
      onSaved({ ...card, term: edit.term.trim(), meaningVi: edit.meaningVi.trim() || null });
      setEdit(null);
    }
  }
  return (
    <li className="flex items-center gap-4 rounded-xl border border-line bg-card px-4 py-3">
      {edit ? (
        <form
          className="grid flex-1 gap-2 md:grid-cols-[1fr_2fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input autoFocus value={edit.term} onChange={(e) => setEdit({ ...edit, term: e.target.value })} className="field field-sm" aria-label={t("term")} />
          <input value={edit.meaningVi} onChange={(e) => setEdit({ ...edit, meaningVi: e.target.value })} className="field field-sm" aria-label={t("definition")} />
          <span className="flex gap-1">
            <button className="btn btn-sm btn-primary">{t("save")}</button>
            <button type="button" onClick={() => setEdit(null)} className="btn btn-sm btn-ghost">
              {t("cancel")}
            </button>
          </span>
        </form>
      ) : (
        <>
          <div className="w-1/3 min-w-0 border-r border-line pr-4">
            <p className="font-semibold">{card.term}</p>
            {(card.ipa || card.pos) && <p className="text-xs text-muted">{[card.pos, card.ipa].filter(Boolean).join(" ")}</p>}
          </div>
          <p className="min-w-0 flex-1">{meaningOf(card) || <span className="text-muted">—</span>}</p>
          {card.images?.[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.images[0].url} alt="" loading="lazy" className="size-14 flex-none rounded-lg object-cover" />
          )}
          <span className="flex flex-none gap-0.5">
            <button onClick={() => speak(card.term)} className="icon-btn" aria-label={t("listen")}>
              <I.IconSpeaker />
            </button>
            <button onClick={() => setEdit({ term: card.term, meaningVi: card.meaningVi ?? "" })} className="icon-btn" aria-label={t("edit")}>
              <I.IconEdit />
            </button>
          </span>
        </>
      )}
    </li>
  );
}
