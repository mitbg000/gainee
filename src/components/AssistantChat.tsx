"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import Markdown from "@/components/lesson/Markdown";
import type { TreeDoc } from "@/lib/documents/queries";

type Msg = { role: "user" | "assistant"; content: string };
type ChatInfo = { id: string; title: string; lessonId: number | null; updatedAt: string };
const newId = () => crypto.randomUUID();

/** Chat with the AI tutor. Conversations are saved on the server; a lesson can be attached as context. */
export default function AssistantChat({ docs, initialLessonId }: { docs: TreeDoc[]; initialLessonId: number | null }) {
  const t = useTranslations("assistant");
  const [chatId, setChatId] = useState(newId);
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [lessonId, setLessonId] = useState<number | null>(initialLessonId);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const loadList = () =>
    fetch("/api/assistant/chats", { cache: "no-store" })
      .then((r) => r.json())
      .then(setChats)
      .catch(() => {});
  useEffect(() => {
    loadList();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  async function open(id: string) {
    if (busy) return;
    const c = await fetch(`/api/assistant/chats/${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
    if (!c) return;
    setChatId(id);
    setMsgs(c.messages);
    setLessonId(c.lessonId);
  }
  function startNew() {
    if (busy) return;
    setChatId(newId());
    setMsgs([]);
  }
  async function remove() {
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/assistant/chats/${chatId}`, { method: "DELETE" });
    startNew();
    loadList();
  }
  const persist = (messages: Msg[]) =>
    fetch(`/api/assistant/chats/${chatId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: (messages.find((m) => m.role === "user")?.content ?? "").slice(0, 120), lessonId, messages: messages.slice(-200) }),
    }).then(loadList);

  async function send() {
    const text = input.trim();
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
      const r = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lessonId, messages: history.filter((m) => m.content).slice(-20) }), signal: c.signal });
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

  const sel = "min-h-9 max-w-full rounded-lg border border-line bg-card px-2 text-sm";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={chats.some((c) => c.id === chatId) ? chatId : ""} onChange={(e) => (e.target.value ? open(e.target.value) : startNew())} className={`${sel} min-w-0 flex-1`} aria-label={t("history")}>
          <option value="">{t("newChat")}</option>
          {chats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title || "…"}
            </option>
          ))}
        </select>
        <button onClick={startNew} className="min-h-9 rounded-lg border border-line px-3 text-sm">
          ＋ {t("new")}
        </button>
        {chats.some((c) => c.id === chatId) && (
          <button onClick={remove} className="min-h-9 rounded-lg border border-line px-3 text-sm text-muted" aria-label={t("delete")}>
            🗑
          </button>
        )}
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {t("context")}
        <select value={lessonId ?? ""} onChange={(e) => setLessonId(Number(e.target.value) || null)} className={`${sel} min-w-0 flex-1`}>
          <option value="">{t("noContext")}</option>
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
      </label>
      {msgs.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {(["s1", "s2", "s3"] as const).map((k) => (
            <button key={k} onClick={() => setInput(t(`suggest.${k}`))} className="rounded-full border border-line bg-card px-3 py-1.5 text-left text-sm hover:border-accent">
              {t(`suggest.${k}`)}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-on-accent">
              {m.content}
            </div>
          ) : (
            <div key={i} className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-card px-4 py-3 text-[15px] leading-relaxed">
              {m.content ? <Markdown text={m.content} /> : <span className="animate-pulse text-muted">{t("thinking")}</span>}
            </div>
          ),
        )}
        <div ref={end} />
      </div>
      {notConfigured && (
        <p className="text-sm">
          {t("notConfigured")}{" "}
          <Link href="/settings" className="text-accent underline">
            {t("openSettings")}
          </Link>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] flex items-end gap-2 rounded-2xl border border-line bg-card p-2 md:bottom-4"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder={t("placeholder")}
          className="min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none"
        />
        {busy ? (
          <button type="button" onClick={() => ctrl.current?.abort()} className="min-h-11 rounded-xl border border-line px-4 text-sm">
            ■
          </button>
        ) : (
          <button disabled={!input.trim()} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-50">
            {t("send")}
          </button>
        )}
      </form>
    </div>
  );
}
