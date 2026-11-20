"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { DictResult } from "@/lib/dictionary/lookup";
import Markdown from "./Markdown";
import type { Anchor, Tool, Vocab } from "./types";
import { useAiAsk, type AskInput } from "./useAiAsk";

type Provider = { id: number; label: string; defaultModel: string; enabled: boolean };
const ACTIONS: AskInput["action"][] = ["explain_word", "explain_sentence", "grammar", "translate", "paraphrase"];

let providerCache: Provider[] | null = null;

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

/** Right-hand (desktop) / bottom-sheet (mobile) panel: dictionary look-up and quick AI questions. */
export default function ToolPanel({
  tool,
  lessonId,
  vocab,
  saved,
  savedTerms,
  onToggleSave,
  onSaveTerm,
  onClose,
  onAskAi,
  onPin,
}: {
  tool: NonNullable<Tool>;
  lessonId: number;
  vocab: Vocab[];
  saved: Record<number, number>;
  savedTerms: Record<string, number>;
  onToggleSave: (vocabId: number) => void;
  onSaveTerm: (term: string, context: string, meaning?: string) => void;
  onClose: () => void;
  onAskAi: (t: Extract<Tool, { mode: "ai" }>) => void;
  onPin: (messageId: number, answer: string, anchor?: Anchor, annotationId?: number, action?: AskInput["action"]) => Promise<void>;
}) {
  const t = useTranslations("lesson.tool");
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-lg" data-tool-panel>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-accent2">{tool.mode === "lookup" ? t("lookup") : t("ai")}</span>
        <button onClick={onClose} aria-label={t("close")} className="rounded-lg px-2 py-1 text-muted hover:text-ink">
          ✕
        </button>
      </div>
      {tool.mode === "lookup" ? (
        <Lookup tool={tool} vocab={vocab} saved={saved} savedTerms={savedTerms} onToggleSave={onToggleSave} onSaveTerm={onSaveTerm} onAskAi={onAskAi} />
      ) : (
        <AiAsk key={`${tool.selection}-${tool.action}`} tool={tool} lessonId={lessonId} onPin={onPin} />
      )}
    </div>
  );
}

function Lookup({
  tool,
  vocab,
  saved,
  savedTerms,
  onToggleSave,
  onSaveTerm,
  onAskAi,
}: {
  tool: Extract<Tool, { mode: "lookup" }>;
  vocab: Vocab[];
  saved: Record<number, number>;
  savedTerms: Record<string, number>;
  onToggleSave: (id: number) => void;
  onSaveTerm: (term: string, context: string, meaning?: string) => void;
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
  const context = tool.anchor?.context ?? v?.context ?? "";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-serif text-2xl font-bold leading-tight">{v?.headword ?? entry?.headword ?? tool.text}</div>
          {(v?.ipa || v?.pos) && (
            <div className="text-sm text-muted">
              {v?.ipa} {v?.pos && <span className="font-semibold text-accent2">{v.pos}</span>}
            </div>
          )}
        </div>
        <button onClick={() => speak(v?.headword ?? tool.text)} className="rounded-lg border border-line px-2 py-1" aria-label={t("listen")}>
          🔊
        </button>
        {v ? (
          <button onClick={() => onToggleSave(v.id)} className={`rounded-lg border px-2 py-1 ${saved[v.id] ? "border-amber-400 bg-amber-50 dark:bg-amber-950" : "border-line"}`} aria-label={t("save")}>
            {saved[v.id] ? "★" : "☆"}
          </button>
        ) : (
          <button
            onClick={() => onSaveTerm(entry?.headword ?? tool.text, context)}
            className={`rounded-lg border px-2 py-1 ${savedTerms[(entry?.headword ?? tool.text).toLowerCase()] ? "border-amber-400 bg-amber-50 dark:bg-amber-950" : "border-line"}`}
            aria-label={t("save")}
          >
            {savedTerms[(entry?.headword ?? tool.text).toLowerCase()] ? "★" : "☆"}
          </button>
        )}
      </div>

      {v && (
        <div className="rounded-xl bg-paper p-3 text-sm">
          <div className="font-semibold text-accent">{v.meaningVi}</div>
          {v.definitionEn && <div className="mt-0.5 text-muted">{v.definitionEn}</div>}
          {v.example && <div className="mt-1.5 italic">✎ {v.example}</div>}
          {v.note && <div className="mt-1.5 text-muted">💡 {v.note}</div>}
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
          className="min-h-10 rounded-xl bg-accent px-3 text-sm font-medium text-on-accent"
        >
          ✨ {t("askMore")}
        </button>
        <Link href={`/dictionary?q=${encodeURIComponent(tool.text)}`} className="flex min-h-10 items-center rounded-xl border border-line px-3 text-sm">
          {t("openDictionary")}
        </Link>
      </div>
    </div>
  );
}

function AiAsk({ tool, lessonId, onPin }: { tool: Extract<Tool, { mode: "ai" }>; lessonId: number; onPin: (id: number, answer: string, anchor?: Anchor, annotationId?: number, action?: AskInput["action"]) => Promise<void> }) {
  const t = useTranslations("lesson.tool");
  const ai = useAiAsk();
  const [action, setAction] = useState(tool.action);
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

  const run = (a: AskInput["action"], q?: string) => {
    setAction(a);
    setPinned(false);
    const p = providers.find((x) => String(x.id) === override);
    ai.ask({
      action: a,
      selection: tool.selection,
      context: tool.context,
      question: q,
      lessonId,
      annotationId: tool.annotationId,
      override: p ? { providerId: p.id, model: p.defaultModel } : undefined,
    });
  };

  useEffect(() => {
    if (tool.action !== "custom") run(tool.action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <blockquote className="max-h-24 overflow-auto border-l-4 border-accent/40 pl-3 font-serif text-[15px] italic">{tool.selection}</blockquote>
      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map((a) => (
          <button
            key={a}
            onClick={() => run(a)}
            disabled={ai.loading}
            className={`min-h-8 rounded-full border px-3 text-sm ${action === a && (ai.text || ai.loading) ? "border-accent bg-accent text-on-accent" : "border-line hover:border-accent"}`}
          >
            {t(`actions.${a}`)}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) run("custom", question.trim());
        }}
        className="flex gap-2"
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("askPlaceholder")} className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-base" />
        <button disabled={!question.trim() || ai.loading} className="rounded-xl border border-line px-3 text-sm disabled:opacity-50">
          {t("send")}
        </button>
      </form>

      <div className="min-h-12 text-[15px] leading-relaxed">
        {ai.notConfigured ? (
          <p className="text-sm">
            {t("notConfigured")}{" "}
            <Link href="/settings" className="text-accent underline">
              {t("openSettings")}
            </Link>
          </p>
        ) : ai.text ? (
          <Markdown text={ai.text} />
        ) : ai.loading ? (
          <p className="animate-pulse text-sm text-muted">{t("thinking")}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {ai.messageId && !ai.loading && ai.text && !ai.text.startsWith("⚠️") && (
          <button
            disabled={pinned}
            onClick={async () => {
              await onPin(ai.messageId!, ai.text, tool.anchor, tool.annotationId, action);
              setPinned(true);
            }}
            className="min-h-9 rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          >
            {pinned ? `📌 ${t("pinned")}` : `📌 ${t("pin")}`}
          </button>
        )}
        {ai.loading && (
          <button onClick={ai.stop} className="min-h-9 rounded-xl border border-line px-3 text-sm">
            ■ {t("stop")}
          </button>
        )}
        {providers.length > 1 && (
          <select value={override} onChange={(e) => setOverride(e.target.value)} className="ml-auto min-h-9 max-w-[11rem] rounded-lg border border-line bg-paper px-2 text-xs" aria-label={t("model")}>
            <option value="">{t("modelDefault")}</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {p.defaultModel}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
