"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import Markdown from "@/components/lesson/Markdown";
import ModelPicker, { loadModelChoice, type ModelChoice } from "@/components/ModelPicker";
import type { TreeDoc } from "@/lib/documents/queries";
import * as I from "@/components/icons";

type Msg = { role: "user" | "assistant"; content: string };
type ChatInfo = { id: string; title: string; lessonId: number | null; updatedAt: string };
const newId = () => crypto.randomUUID();

/**
 * Chat with the AI tutor. Conversations are saved on the server; a lesson can be attached as context.
 * `compact` = the floating bubble panel; otherwise the full ChatGPT-style page with a conversation list.
 * The parent gives it a fixed height; messages scroll inside.
 */
export default function AssistantChat({ docs, initialLessonId, compact = false }: { docs: TreeDoc[]; initialLessonId: number | null; compact?: boolean }) {
  const t = useTranslations("assistant");
  const [chatId, setChatId] = useState(newId);
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [lessonId, setLessonId] = useState<number | null>(initialLessonId);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [model, setModel] = useState<ModelChoice>(null);
  const [listOpen, setListOpen] = useState(false); // conversation list on small screens / in the bubble
  const ctrl = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const loadList = () =>
    fetch("/api/assistant/chats", { cache: "no-store" })
      .then((r) => r.json())
      .then(setChats)
      .catch(() => {});
  useEffect(() => {
    loadList();
    setModel(loadModelChoice());
  }, []);
  useEffect(() => setLessonId(initialLessonId), [initialLessonId]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs]);

  async function open(id: string) {
    if (busy) return;
    const c = await fetch(`/api/assistant/chats/${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
    if (!c) return;
    setChatId(id);
    setMsgs(c.messages);
    setLessonId(c.lessonId);
    setListOpen(false);
  }
  function startNew() {
    if (busy) return;
    setChatId(newId());
    setMsgs([]);
    setListOpen(false);
  }
  async function remove(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/assistant/chats/${id}`, { method: "DELETE" });
    if (id === chatId) startNew();
    loadList();
  }
  const persist = (messages: Msg[]) =>
    fetch(`/api/assistant/chats/${chatId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: (messages.find((m) => m.role === "user")?.content ?? "").slice(0, 120), lessonId, messages: messages.slice(-200) }),
    }).then(loadList);

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setNotConfigured(false);
    const c = new AbortController();
    ctrl.current = c;
    let acc = "";
    const put = (s: string) => setMsgs([...history, { role: "assistant", content: s }]);
    try {
      const r = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId, messages: history.filter((m) => m.content).slice(-20), override: model ?? undefined }),
        signal: c.signal,
      });
      if (!r.ok || !r.body) return put(`⚠️ HTTP ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        if (acc.includes("⚠️ AI_NOT_CONFIGURED")) {
          setNotConfigured(true);
          return setMsgs(history);
        }
        put(acc);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") put(`${acc}\n\n⚠️ ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (acc && !acc.startsWith("⚠️")) persist([...history, { role: "assistant", content: acc }]);
    }
  }

  const btn = "min-h-9 rounded-lg px-2.5 text-sm hover:bg-paper";
  const list = (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <button onClick={startNew} className="btn btn-secondary mb-2">
        <I.IconPlus className="inline-block h-4 w-4 align-[-0.2em]" /> {t("newChat")}
      </button>
      <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("history")}</p>
      <ul className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {chats.map((c) => (
          <li key={c.id} className={`group/c flex items-center rounded-lg ${c.id === chatId ? "bg-accent/10 text-accent" : "hover:bg-card"}`}>
            <button onClick={() => open(c.id)} className="min-h-9 min-w-0 flex-1 truncate px-2 text-left text-sm" title={c.title}>
              {c.title || "…"}
            </button>
            <button onClick={() => remove(c.id)} aria-label={t("delete")} className="px-2 text-xs text-muted opacity-0 hover:text-red-600 group-hover/c:opacity-100 focus:opacity-100">
              <I.IconTrash className="inline-block h-4 w-4 align-[-0.2em]" />
            </button>
          </li>
        ))}
        {chats.length === 0 && <li className="px-2 py-1 text-sm text-muted">{t("noChats")}</li>}
      </ul>
    </div>
  );

  const contextSelect = (
    <select value={lessonId ?? ""} onChange={(e) => setLessonId(Number(e.target.value) || null)} aria-label={t("context")} className="field field-sm min-w-0 max-w-[16rem] truncate">
      <option value="">📄 {t("noContext")}</option>
      {docs.map((d) => (
        <optgroup key={d.id} label={d.title}>
          {d.lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.position}. {l.title}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  return (
    <div className="relative flex h-full min-h-0">
      {/* conversation list: always visible on the wide page, a drawer otherwise */}
      {!compact && <aside className="hidden w-64 flex-none flex-col border-r border-line bg-paper p-3 md:flex">{list}</aside>}
      {listOpen && (
        <div className="absolute inset-0 z-20 flex">
          <div className="flex w-72 max-w-[85%] flex-col border-r border-line bg-paper p-3 shadow-xl">{list}</div>
          <button aria-label={t("closeList")} className="flex-1 bg-black/30" onClick={() => setListOpen(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
          <button onClick={() => setListOpen(true)} className={`${btn} ${compact ? "" : "md:hidden"}`} aria-label={t("history")}>
            <I.IconMenu className="inline-block h-4 w-4 align-[-0.2em]" />
          </button>
          <ModelPicker value={model} onChange={setModel} />
          {!compact && contextSelect}
          <span className="ml-auto flex items-center">
            <button onClick={startNew} className={btn} title={t("newChat")} aria-label={t("newChat")}>
              <I.IconEdit className="inline-block h-4 w-4 align-[-0.2em]" />
            </button>
            {compact && (
              <Link href={lessonId ? `/assistant?lesson=${lessonId}` : "/assistant"} className={btn} title={t("openFull")} aria-label={t("openFull")}>
                <I.IconExpand className="inline-block h-4 w-4 align-[-0.2em]" />
              </Link>
            )}
          </span>
          {compact && <div className="w-full">{contextSelect}</div>}
        </div>

        {/* messages */}
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className={`mx-auto w-full ${compact ? "px-3" : "max-w-3xl px-4"} py-5`}>
            {msgs.length === 0 ? (
              <div className={`flex flex-col items-center text-center ${compact ? "pt-6" : "pt-[12vh]"}`}>
                <I.IconSpark className="h-10 w-10 text-accent" />
                <h2 className={`mt-2 font-serif font-bold ${compact ? "text-xl" : "text-3xl"}`}>{t("hello")}</h2>
                <p className="mt-1 max-w-md text-sm text-muted">{t("intro")}</p>
                <div className={`mt-6 grid w-full gap-2 ${compact ? "" : "sm:grid-cols-3"}`}>
                  {(["s1", "s2", "s3"] as const).map((k) => (
                    <button key={k} onClick={() => send(t(`suggest.${k}`))} className="rounded-2xl border border-line bg-card px-3 py-2.5 text-left text-sm hover:border-accent">
                      {t(`suggest.${k}`)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {msgs.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-3xl bg-card px-4 py-2.5">
                      {m.content}
                    </div>
                  ) : (
                    <div key={i} className="flex gap-3 text-[15px] leading-relaxed">
                      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full border border-line text-sm"><I.IconSpark className="inline-block h-4 w-4 align-[-0.2em]" /></span>
                      <div className="min-w-0 flex-1">{m.content ? <Markdown text={m.content} /> : <span className="animate-pulse text-muted">{t("thinking")}</span>}</div>
                    </div>
                  ),
                )}
              </div>
            )}
            {notConfigured && (
              <p className="mt-4 text-sm">
                {t("notConfigured")}{" "}
                <Link href="/settings" className="text-accent underline">
                  {t("openSettings")}
                </Link>
              </p>
            )}
          </div>
        </div>

        {/* composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className={`mx-auto w-full ${compact ? "p-2" : "max-w-3xl px-4 pb-4"}`}
        >
          <div className="flex items-end gap-2 rounded-3xl border border-line bg-card p-2 shadow-sm focus-within:border-accent">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={t("placeholder")}
              className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-base outline-none [field-sizing:content]"
            />
            {busy ? (
              <button type="button" onClick={() => ctrl.current?.abort()} aria-label={t("stop")} className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-ink text-paper">
                <I.IconStop className="inline-block h-4 w-4 align-[-0.2em]" />
              </button>
            ) : (
              <button disabled={!input.trim()} aria-label={t("send")} className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent text-lg text-on-accent disabled:opacity-40">
                <I.IconSend className="inline-block h-4 w-4 align-[-0.2em]" />
              </button>
            )}
          </div>
          {!compact && <p className="mt-1.5 text-center text-xs text-muted">{t("disclaimer")}</p>}
        </form>
      </div>
    </div>
  );
}
