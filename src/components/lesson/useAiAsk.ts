"use client";

import { useCallback, useRef, useState } from "react";

export type AskInput = {
  action: "explain_word" | "explain_sentence" | "grammar" | "translate" | "paraphrase" | "custom" | "feedback";
  selection: string;
  context?: string;
  question?: string;
  feedbackKind?: string;
  prompt?: string;
  lessonId?: number;
  annotationId?: number;
  override?: { providerId: number; model: string };
};

/** Stream an answer from /api/ai/ask. */
export function useAiAsk() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [messageId, setMessageId] = useState<number | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  const ask = useCallback(async (input: AskInput) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setText("");
    setMessageId(null);
    setNotConfigured(false);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: c.signal });
      if (!res.ok || !res.body) {
        setText(`⚠️ HTTP ${res.status}`);
        return;
      }
      setMessageId(Number(res.headers.get("x-message-id")) || null);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        if (acc.includes("⚠️ AI_NOT_CONFIGURED")) {
          setNotConfigured(true);
          setText("");
          setMessageId(null);
          return;
        }
        setText(acc);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setText(`⚠️ ${(e as Error).message}`);
    } finally {
      if (ctrl.current === c) setLoading(false);
    }
  }, []);

  const stop = useCallback(() => ctrl.current?.abort(), []);
  const reset = useCallback(() => {
    ctrl.current?.abort();
    setText("");
    setMessageId(null);
    setNotConfigured(false);
    setLoading(false);
  }, []);
  return { text, loading, messageId, notConfigured, ask, stop, reset };
}
