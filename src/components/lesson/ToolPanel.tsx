"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { parseDictEntry } from "@/lib/dictionary/parse";
import type { DictResult } from "@/lib/dictionary/lookup";
import Markdown from "./Markdown";
import type { TermWord } from "./Panes";
import type { AiMsg, Anchor, Tool, Vocab, WordCard } from "./types";
import { useAiAsk, type AskInput } from "./useAiAsk";
import { speak } from "@/lib/speech";
import * as I from "@/components/icons";

type Provider = { id: number; label: string; defaultModel: string; enabled: boolean };
const ACTIONS: AskInput["action"][] = ["explain_word", "explain_sentence", "grammar", "translate", "paraphrase", "vocab_card", "custom"];

let providerCache: Provider[] | null = null;

/** Right-hand (desktop) / bottom-sheet (mobile) panel: dictionary look-up and quick AI questions. */
export default function ToolPanel({
  tool,
  lessonId,
  vocab,
  saved,
  savedTerms,
  termWords,
  onToggleSave,
  onSaveTerm,
  onClose,
  onAskAi,
  onPin,
  onSaveCard,
}: {
  tool: NonNullable<Tool>;
  lessonId: number;
  vocab: Vocab[];
  saved: Record<number, number>;
  savedTerms: Record<string, number>;
  termWords: TermWord[];
  onToggleSave: (vocabId: number) => void;
  onSaveTerm: (term: string, context: string, extra?: { ipa?: string | null; pos?: string | null; meaningVi?: string | null }) => void;
  onClose: () => void;
  onAskAi: (t: Extract<Tool, { mode: "ai" }>) => void;
  onPin: (messageId: number, answer: string, anchor?: Anchor, annotationId?: number, action?: AiMsg["action"]) => Promise<void>;
  onSaveCard: (card: WordCard, context: string) => Promise<void>;
}) {
  const t = useTranslations("lesson.tool");
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-lg" data-tool-panel>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-accent2">{tool.mode === "lookup" ? t("lookup") : t("ai")}</span>
        <button onClick={onClose} aria-label={t("close")} className="icon-btn">
          <I.IconClose className="inline-block h-4 w-4 align-[-0.2em]" />
        </button>
      </div>
      {tool.mode === "lookup" ? (
        <Lookup tool={tool} vocab={vocab} saved={saved} savedTerms={savedTerms} termWords={termWords} onToggleSave={onToggleSave} onSaveTerm={onSaveTerm} onAskAi={onAskAi} />
      ) : (
        <AiAsk key={`${tool.selection}-${tool.action}`} tool={tool} lessonId={lessonId} onPin={onPin} onSaveCard={onSaveCard} />
      )}
    </div>
  );
}

function Lookup({
  tool,
  vocab,
  saved,
  savedTerms,
  termWords,
  onToggleSave,
  onSaveTerm,
  onAskAi,
}: {
  tool: Extract<Tool, { mode: "lookup" }>;
  vocab: Vocab[];
  saved: Record<number, number>;
  savedTerms: Record<string, number>;
  termWords: TermWord[];
  onToggleSave: (id: number) => void;
  onSaveTerm: (term: string, context: string, extra?: { ipa?: string | null; pos?: string | null; meaningVi?: string | null }) => void;
  onAskAi: (t: Extract<Tool, { mode: "ai" }>) => void;
}) {
  const t = useTranslations("lesson.tool");
  const [dict, setDict] = useState<DictResult | null>(null);
  const [more, setMore] = useState(false);
  const v =
    vocab.find((x) => x.id === tool.vocabId) ??
    vocab.find((x) => [x.match.toLowerCase(), x.headword.toLowerCase()].includes(tool.text.toLowerCase()));

  useEffect(() => {
    let alive = true;
    setDict(null);
    setMore(false);
    fetch(`/api/dictionary?q=${encodeURIComponent(tool.text)}`)
      .then((r) => r.json())
      .then((d) => alive && setDict(d))
      .catch(() => alive && setDict({ query: tool.text, matched: null, via: null, entries: [] }));
    return () => {
      alive = false;
    };
  }, [tool.text]);

  const entry = dict?.entries[0];
  // a word the learner saved (e.g. an AI vocabulary card): match the clicked form, the dictionary headword or its lemma
  const keys = [tool.text, entry?.headword, dict?.matched].filter(Boolean).map((k) => k!.toLowerCase());
  const mine = v ? undefined : termWords.find((w) => keys.includes(w.term.toLowerCase()));
  const context = tool.anchor?.context ?? v?.context ?? "";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-serif text-2xl font-bold leading-tight">{v?.headword ?? mine?.term ?? entry?.headword ?? tool.text}</div>
          {(v?.ipa || v?.pos) && (
            <div className="text-sm text-muted">
              {v?.ipa} {v?.pos && <span className="font-semibold text-accent2">{v.pos}</span>}
            </div>
          )}
        </div>
        <button onClick={() => speak(v?.headword ?? tool.text)} className="icon-btn icon-btn-outline" aria-label={t("listen")}>
          <I.IconSpeaker className="inline-block h-4 w-4 align-[-0.2em]" />
        </button>
        {v ? (
          <button onClick={() => onToggleSave(v.id)} className={`icon-btn icon-btn-outline ${saved[v.id] ? "is-on" : ""}`} aria-label={t("save")}>
            <I.IconStar />
          </button>
        ) : (
          <button
            onClick={() => onSaveTerm(mine?.term ?? entry?.headword ?? tool.text, context, entry ? parseDictEntry(entry.html, entry.headword) : undefined)}
            className={`icon-btn icon-btn-outline ${savedTerms[(mine?.term ?? entry?.headword ?? tool.text).toLowerCase()] ? "is-on" : ""}`}
            aria-label={t("save")}
          >
            <I.IconStar />
          </button>
        )}
      </div>

      {v && (
        <div className="rounded-xl bg-paper p-3 text-sm">
          <div className="font-semibold text-accent">{v.meaningVi}</div>
          {v.definitionEn && <div className="mt-0.5 text-muted">{v.definitionEn}</div>}
          {v.example && <div className="mt-1.5 italic"><I.IconQuote className="inline-block h-4 w-4 align-[-0.2em] text-muted" /> {v.example}</div>}
          {v.note && <div className="mt-1.5 text-muted"><I.IconBulb className="inline-block h-4 w-4 align-[-0.2em]" /> {v.note}</div>}
        </div>
      )}

      {mine && (mine.meaningVi || mine.definitionEn || mine.ipa) && (
        <div className="rounded-xl bg-paper p-3 text-sm">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{t("mySaved")}</div>
          {(mine.ipa || mine.pos) && (
            <div className="text-muted">
              {mine.ipa} {mine.pos && <span className="font-semibold text-accent2">{mine.pos}</span>}
            </div>
          )}
          {mine.meaningVi && <div className="font-semibold text-accent">{mine.meaningVi}</div>}
          {mine.definitionEn && <div className="mt-0.5 text-muted">{mine.definitionEn}</div>}
          {mine.example && <div className="mt-1.5 italic"><I.IconQuote className="inline-block h-4 w-4 align-[-0.2em] text-muted" /> {mine.example}</div>}
          {mine.note && <div className="mt-1.5 text-muted"><I.IconBulb className="inline-block h-4 w-4 align-[-0.2em]" /> {mine.note}</div>}
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{t("dictionary")}</div>
        {!dict && <p className="text-sm text-muted">{t("loading")}</p>}
        {dict && !entry && <p className="text-sm text-muted">{t("notInDictionary")}</p>}
        {entry && (
          <div className="relative">
            <div className={`dict-entry text-[15px] ${more ? "" : "max-h-48 overflow-hidden"}`} dangerouslySetInnerHTML={{ __html: (more ? dict!.entries : [entry]).map((e) => e.html).join("<hr>") }} />
            {!more && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card" />}
            <button onClick={() => setMore(!more)} className="mt-1 text-sm text-accent">
              {more ? t("less") : t("more")}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onAskAi({ mode: "ai", action: "explain_word", selection: tool.text, context, anchor: tool.anchor })}
          className="btn btn-primary"
        >
          <I.IconSpark className="inline-block h-4 w-4 align-[-0.2em]" /> {t("askMore")}
        </button>
        <Link href={`/dictionary?q=${encodeURIComponent(tool.text)}`} className="btn btn-secondary">
          {t("openDictionary")}
        </Link>
      </div>
    </div>
  );
}

/** Pull the first {...} out of an AI reply and turn it into a card (null if it is not valid). */
function parseCard(text: string, fallbackTerm: string): WordCard | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const g = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
    return { term: g("term") || fallbackTerm, ipa: g("ipa"), pos: g("pos"), meaningVi: g("meaningVi"), definitionEn: g("definitionEn"), example: g("example"), note: g("note") };
  } catch {
    return null;
  }
}

const CARD_FIELDS = ["term", "ipa", "pos", "meaningVi", "definitionEn", "example", "note"] as const;

/** AI-generated vocabulary card: every field can be edited before saving. */
function CardForm({ initial, onSave }: { initial: WordCard; onSave: (c: WordCard) => Promise<void> }) {
  const t = useTranslations("wordList");
  const [card, setCard] = useState(initial);
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const field = "w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm outline-none focus:border-accent";
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {CARD_FIELDS.map((k) => (
          <label key={k} className={`text-xs text-muted ${["definitionEn", "example", "note"].includes(k) ? "sm:col-span-2" : ""}`}>
            {t(`field.${k}`)}
            {["definitionEn", "example", "note"].includes(k) ? (
              <textarea rows={2} className={field} value={card[k]} onChange={(e) => (setCard({ ...card, [k]: e.target.value }), setState(""))} />
            ) : (
              <input className={field} value={card[k]} onChange={(e) => (setCard({ ...card, [k]: e.target.value }), setState(""))} />
            )}
          </label>
        ))}
      </div>
      <button
        disabled={!card.term.trim() || state === "saving"}
        onClick={async () => {
          setState("saving");
          await onSave(card);
          setState("saved");
        }}
        className="btn btn-primary"
      >
        <I.IconStar className={`inline-block h-4 w-4 align-[-0.2em] ${state === "saved" ? "fill-current" : ""}`} /> {state === "saved" ? t("saved") : t("saveWord")}
      </button>
    </div>
  );
}

function AiAsk({
  tool,
  lessonId,
  onPin,
  onSaveCard,
}: {
  tool: Extract<Tool, { mode: "ai" }>;
  lessonId: number;
  onPin: (id: number, answer: string, anchor?: Anchor, annotationId?: number, action?: AiMsg["action"]) => Promise<void>;
  onSaveCard: (card: WordCard, context: string) => Promise<void>;
}) {
  const t = useTranslations("lesson.tool");
  const ai = useAiAsk();
  const [action, setAction] = useState<AskInput["action"]>(tool.action === "feedback" ? "explain_word" : tool.action);
  const [started, setStarted] = useState(false);
  const [question, setQuestion] = useState("");
  const [providers, setProviders] = useState<Provider[]>(providerCache ?? []);
  const [override, setOverride] = useState<string>("");
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!providerCache)
      fetch("/api/ai/providers")
        .then((r) => r.json())
        .then((p: Provider[]) => {
          providerCache = p.filter((x) => x.enabled);
          setProviders(providerCache);
        })
        .catch(() => {});
  }, []);

  // nothing is sent until the learner picks what they want and presses "Generate"
  const generate = () => {
    setStarted(true);
    setPinned(false);
    const p = providers.find((x) => String(x.id) === override);
    ai.ask({
      action,
      selection: tool.selection,
      context: tool.context,
      question: action === "custom" ? question.trim() : undefined,
      lessonId,
      annotationId: tool.annotationId,
      override: p ? { providerId: p.id, model: p.defaultModel } : undefined,
    });
  };
  const isCard = action === "vocab_card";
  const card = isCard && started && !ai.loading && ai.text ? parseCard(ai.text, tool.selection) : null;

  return (
    <div className="space-y-3">
      <blockquote className="max-h-24 overflow-auto no-scrollbar border-l-4 border-accent/40 pl-3 font-serif text-[15px] italic">{tool.selection}</blockquote>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("choose")}</p>
      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map((a) => (
          <button
            key={a}
            onClick={() => setAction(a)}
            disabled={ai.loading}
            aria-pressed={action === a}
            className={`chip ${action === a ? "chip-on" : ""}`}
          >
            {t(`actions.${a}`)}
          </button>
        ))}
      </div>
      {action === "custom" && (
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("askPlaceholder")} className="field w-full text-base" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={generate}
          disabled={ai.loading || (action === "custom" && !question.trim())}
          className="btn btn-primary"
        >
          <I.IconSpark className="inline-block h-4 w-4 align-[-0.2em]" /> {t("generate")}
        </button>
        {providers.length > 1 && (
          <select value={override} onChange={(e) => setOverride(e.target.value)} className="field field-sm max-w-[11rem]" aria-label={t("model")}>
            <option value="">{t("modelDefault")}</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {p.defaultModel}
              </option>
            ))}
          </select>
        )}
        {ai.loading && (
          <button onClick={ai.stop} className="btn btn-sm btn-secondary">
            <I.IconStop className="inline-block h-4 w-4 align-[-0.2em]" /> {t("stop")}
          </button>
        )}
      </div>

      <div className="min-h-6 text-[15px] leading-relaxed">
        {ai.notConfigured ? (
          <p className="text-sm">
            {t("notConfigured")}{" "}
            <Link href="/settings" className="text-accent underline">
              {t("openSettings")}
            </Link>
          </p>
        ) : card ? (
          <CardForm key={ai.messageId} initial={card} onSave={(c) => onSaveCard(c, tool.context)} />
        ) : ai.loading ? (
          <p className="animate-pulse text-sm text-muted">{t("thinking")}</p>
        ) : isCard && started && ai.text ? (
          <p className="text-sm text-red-600">{t("cardFailed")}</p>
        ) : ai.text ? (
          <Markdown text={ai.text} />
        ) : null}
      </div>

      {!isCard && ai.messageId && !ai.loading && ai.text && !ai.text.startsWith("⚠️") && (
        <div className="border-t border-line pt-3">
          <button
            disabled={pinned}
            onClick={async () => {
              await onPin(ai.messageId!, ai.text, tool.anchor, tool.annotationId, action as AiMsg["action"]);
              setPinned(true);
            }}
            className="btn btn-sm btn-secondary"
          >
            <I.IconPin className="inline-block h-4 w-4 align-[-0.2em]" /> {pinned ? t("pinned") : t("pin")}
          </button>
        </div>
      )}
    </div>
  );
}
