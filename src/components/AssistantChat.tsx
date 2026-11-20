"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import Markdown from "@/components/lesson/Markdown";

type Msg = { role: "user" | "assistant"; content: string };
const KEY = "assistant_chat";

/** Chat with the AI tutor. The conversation is kept in this browser only. */
export default function AssistantChat() {
  const t = useTranslations("assistant");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(v)) setMsgs(v);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(msgs.slice(-60)));
    } catch {}
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

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
      const r = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: history.filter((m) => m.content).slice(-20) }), signal: c.signal });
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
    }
  }

  return (
    <div className="flex flex-col gap-3">
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
      {msgs.length > 0 && !busy && (
        <button onClick={() => setMsgs([])} className="self-start text-sm text-muted underline">
          {t("clear")}
        </button>
      )}
    </div>
  );
}
