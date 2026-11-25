"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { markSection } from "@/lib/ielts/score";
import { numbersOfGroup, type SectionContent, type Skill } from "@/lib/ielts/types";
import ReaderLookup from "@/components/reader/ReaderLookup";
import Markdown from "@/components/lesson/Markdown";
import { useAiAsk } from "@/components/lesson/useAiAsk";
import { sfx } from "@/lib/sound";
import Questions, { Passage } from "./Questions";
import * as I from "@/components/icons";

export type PracticeData = {
  id: number;
  testId: number;
  skill: Skill;
  part: number;
  label: string;
  content: SectionContent;
  answers: Record<string, string>;
  transcript: string | null;
  audio: { url: string; start: number | null; end: number | null } | null;
};

const SPEEDS = [0.75, 1, 1.25];
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Practice one Listening part / Reading passage (or one question group of it) at your own pace:
 * look words up, replay the audio, check, then ask AI why an answer is right. The result is saved for the mistakes list.
 */
export default function PracticeSection({ data, only }: { data: PracticeData; only?: number }) {
  const t = useTranslations("ielts.practice");
  const [values, setValues] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState<Record<number, boolean> | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [started, setStarted] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [asked, setAsked] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [picked, setPicked] = useState("");
  const pending = useRef<{ n: number | null; question: string } | null>(null);
  const ai = useAiAsk();
  const audio = useRef<HTMLAudioElement>(null);
  const aiBox = useRef<HTMLDivElement>(null);
  const c = data.content;
  const source = data.skill === "reading" ? (c.passage ?? "") : (data.transcript ?? "");

  useEffect(() => {
    if (marks) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [marks]);
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);
  // a finished AI answer is kept in this try's history
  // (asked before checking: kept until the try is saved, then stored with it)
  const queue = useRef<{ n: number | null; question: string; answer: string }[]>([]);
  useEffect(() => {
    const p = pending.current;
    if (!ai.loading && p && ai.text && !ai.text.startsWith("⚠️")) {
      pending.current = null;
      queue.current.push({ ...p, answer: ai.text.slice(0, 20000) });
    }
    if (!attemptId) return;
    for (const note of queue.current.splice(0)) fetch(`/api/ielts/attempts/${attemptId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(note) }).catch(() => {});
  }, [ai.loading, ai.text, attemptId]);

  const nums = useMemo(() => c.groups.flatMap((g, i) => (only === undefined || only === i ? numbersOfGroup(g) : [])), [c.groups, only]);
  const filled = nums.filter((n) => values[`${data.id}:${n}`]?.trim()).length;

  function check() {
    const given = Object.fromEntries(nums.map((n) => [n, values[`${data.id}:${n}`] ?? ""]));
    const m = markSection(c, given, data.answers, only);
    setMarks(m);
    const right = Object.values(m).filter(Boolean).length;
    sfx(right === nums.length ? "done" : right >= nums.length / 2 ? "correct" : "wrong");
    fetch("/api/ielts/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ testId: data.testId, sectionId: data.id, group: only, mode: "practice", skill: data.skill, answers: values, seconds: Math.round((Date.now() - started) / 1000) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setAttemptId(j?.id ?? null))
      .catch(() => {});
  }
  function retry() {
    setMarks(null);
    setAttemptId(null); // notes from now on belong to the next try
    setValues((v) => Object.fromEntries(Object.entries(v).filter(([k]) => marks?.[Number(k.split(":")[1])])));
    setStarted(Date.now());
    ai.reset();
    setAsked(null);
  }

  function itemText(n: number) {
    for (const g of c.groups) {
      if (n < g.from || n > g.to) continue;
      const it = g.items?.find((x) => x.n.includes(n));
      if (it) return `${it.q}${it.options ? `\n${it.options.map((o) => `${o.key} ${o.text}`).join("\n")}` : ""}${g.options ? `\nOptions: ${g.options.map((o) => `${o.key} ${o.text}`).join("; ")}` : ""}`;
      const line = (g.text ?? "").split("\n").find((l) => l.includes(`[[${n}]]`));
      return `${g.instructions}\n${line ?? ""}`;
    }
    return "";
  }
  function explain(n: number) {
    setAsked(t("explainOf", { n }));
    pending.current = { n, question: t("explainOf", { n }) };
    ai.ask({
      action: "custom",
      selection: clip(source, 5900),
      question: clip(
        `IELTS ${data.skill} question ${n}: ${itemText(n)}\nCorrect answer: ${data.answers[n] ?? "?"}. Learner's answer: ${values[`${data.id}:${n}`] || "(blank)"}.\nExplain briefly why the correct answer is right: quote the exact sentence from the ${data.skill === "reading" ? "passage" : "transcript"} that gives it, show the paraphrase between question and text, and why the learner's answer is wrong.`,
        1990,
      ),
    });
    setTimeout(() => aiBox.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
  }
  // text selected in the passage / transcript (areas marked data-ask) can be sent to AI
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const node = sel.getRangeAt(0).commonAncestorContainer;
      const el = node instanceof Element ? node : node.parentElement;
      const text = sel.toString().replace(/\s+/g, " ").trim();
      if (el?.closest("[data-ask]") && text.length >= 2) setPicked(text.slice(0, 1500));
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);
  function run(label: string, input: Parameters<typeof ai.ask>[0]) {
    setAsked(label);
    pending.current = { n: null, question: clip(label, 1990) };
    ai.ask(input);
    setTimeout(() => aiBox.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
  }
  const askPicked = (action: "explain_sentence" | "translate" | "grammar" | "paraphrase") =>
    run(`${t(`pick.${action}`)}: “${clip(picked, 300)}”`, { action, selection: picked, context: clip(source, 3900) });
  const whole = data.skill === "reading" ? "passage" : "recording";
  const summarise = () => run(t("summary"), { action: "custom", selection: clip(source, 5900), question: `Summarise this IELTS ${whole} for a Vietnamese learner: who is speaking/writing, the situation, and the main points in order (bullets). Then list 5 useful words or phrases from it with Vietnamese meanings.` });
  const translateAll = () => run(t("translateAll"), { action: "custom", selection: clip(source, 5900), question: `Translate this IELTS ${whole} into natural Vietnamese, paragraph by paragraph${data.skill === "listening" ? ", keeping the speaker names" : ""}.` });

  function askFree(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setAsked(question.trim());
    pending.current = { n: null, question: clip(question.trim(), 1990) };
    ai.ask({ action: "custom", selection: clip(source || c.groups.map((g) => g.instructions).join("\n"), 5900), question: clip(question.trim(), 1990) });
    setQuestion("");
  }

  const score = marks ? Object.values(marks).filter(Boolean).length : 0;
  const secs = Math.round((now - started) / 1000);

  const questions = <Questions content={c} sid={data.id} values={values} onChange={marks ? undefined : (k, v) => setValues((x) => ({ ...x, [k]: v }))} marks={marks ?? undefined} keys={data.answers} only={only} onExplain={explain} explainLabel={t("why")} />;

  const aiPanel = (
    <div ref={aiBox} className="rounded-2xl border border-line bg-card p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <I.IconSpark className="h-4 w-4 text-accent" /> {t("askAi")}
      </p>
      {picked && (
        <div className="mt-2 rounded-xl bg-paper p-2.5">
          <p className="flex items-start gap-2 text-sm">
            <span className="min-w-0 flex-1 italic">“{clip(picked, 220)}”</span>
            <button onClick={() => setPicked("")} className="text-muted" aria-label={t("clearPick")}>
              <I.IconX className="h-4 w-4" />
            </button>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(["explain_sentence", "translate", "grammar", "paraphrase"] as const).map((a) => (
              <button key={a} onClick={() => askPicked(a)} disabled={ai.loading} className="chip">
                {t(`pick.${a}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      {!picked && source && <p className="mt-1 text-xs text-muted">{t(data.skill === "reading" ? "pickHintReading" : "pickHintListening")}</p>}
      {source && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button onClick={summarise} disabled={ai.loading} className="chip">
            {t("summary")}
          </button>
          <button onClick={translateAll} disabled={ai.loading} className="chip">
            {t("translateAll")}
          </button>
        </div>
      )}
      {asked && <p className="mt-3 text-sm font-semibold text-muted">{asked}</p>}
      {ai.notConfigured && <p className="mt-2 text-sm text-muted">{t("noAi")}</p>}
      {(ai.text || ai.loading) && <Markdown text={ai.text || "…"} className="mt-2 text-[15px]" />}
      <form onSubmit={askFree} className="mt-3 flex gap-2">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("askPlaceholder")} className="field field-sm min-w-0 flex-1" />
        <button disabled={!question.trim() || ai.loading} className="btn btn-sm btn-secondary">
          {t("send")}
        </button>
      </form>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/ielts" className="icon-btn" aria-label={t("back")}>
          <I.IconArrowLeft />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{data.label}</h1>
          <p className="text-sm text-muted">
            {only !== undefined ? t("groupOnly", { from: c.groups[only].from, to: c.groups[only].to }) : t("whole", { n: nums.length })} · <I.IconClock className="inline-block h-3.5 w-3.5 align-[-0.15em]" /> {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
          </p>
        </div>
        {marks ? (
          <>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${score === nums.length ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-paper"}`}>
              {score}/{nums.length}
            </span>
            {score < nums.length && (
              <button onClick={retry} className="btn btn-secondary">
                <I.IconRefresh /> {t("retryWrong")}
              </button>
            )}
          </>
        ) : (
          <button onClick={check} disabled={!filled} className="btn btn-primary">
            <I.IconCheck /> {t("check", { filled, n: nums.length })}
          </button>
        )}
      </div>

      {data.skill === "listening" && (
        <div className="sticky top-16 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-3 shadow-sm">
          {data.audio ? (
            <>
              <audio
                ref={audio}
                src={data.audio.url}
                controls
                preload="metadata"
                className="h-10 min-w-0 flex-1"
                onLoadedMetadata={(e) => {
                  if (data.audio?.start) e.currentTarget.currentTime = data.audio.start;
                  e.currentTarget.playbackRate = speed;
                }}
                onTimeUpdate={(e) => {
                  const a = e.currentTarget;
                  if (data.audio?.end && a.currentTime >= data.audio.end) a.pause();
                  if (data.audio?.start && a.currentTime < data.audio.start - 1) a.currentTime = data.audio.start;
                }}
              />
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    const a = audio.current;
                    if (!a) return;
                    a.currentTime = data.audio?.start ?? 0;
                    a.play().catch(() => {});
                  }}
                  className="chip"
                  title={t("replayAll")}
                >
                  <I.IconRefresh className="h-3.5 w-3.5" /> {t("replayAll")}
                </button>
                <button
                  onClick={() => {
                    const a = audio.current;
                    if (!a) return;
                    a.currentTime = Math.max(data.audio?.start ?? 0, a.currentTime - 5);
                    a.play().catch(() => {});
                  }}
                  className="chip"
                >
                  −5s
                </button>
              </div>
              <div className="flex gap-1">
                {SPEEDS.map((s) => (
                  <button key={s} onClick={() => setSpeed(s)} className={`chip ${speed === s ? "chip-on" : ""}`}>
                    {s}×
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">{t("noAudio")}</p>
          )}
        </div>
      )}

      {data.skill === "reading" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <ReaderLookup className="rounded-2xl border border-line bg-card p-5 font-serif text-[17px] lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            <div data-ask>
              <Passage text={c.passage ?? ""} intro={c.intro} />
            </div>
          </ReaderLookup>
          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-card p-5">{questions}</div>
            {aiPanel}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ReaderLookup className="rounded-2xl border border-line bg-card p-5">{questions}</ReaderLookup>
          {data.transcript && (
            <div className="rounded-2xl border border-line bg-card p-5">
              <button onClick={() => setShowScript(!showScript)} className="btn btn-sm btn-secondary">
                {showScript ? t("hideScript") : t("showScript")}
              </button>
              {!marks && !showScript && <span className="ml-2 text-xs text-muted">{t("scriptSpoiler")}</span>}
              {showScript && (
                <ReaderLookup className="mt-3 whitespace-pre-line font-serif text-[16px] leading-relaxed">
                  <p data-ask>{data.transcript}</p>
                </ReaderLookup>
              )}
            </div>
          )}
          {aiPanel}
        </div>
      )}
      <p className="mt-4 text-center text-xs text-muted">{t("lookupTip")}</p>
    </div>
  );
}
