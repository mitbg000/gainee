"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * In-app notices and confirmations instead of the browser's alert() / confirm():
 *   toast("Saved")                     – a short notice that goes away by itself
 *   toast("Could not save", "error")
 *   if (!(await ask("Delete this word?", { danger: true }))) return;   – waits for the answer
 * <Toaster /> (in the root layout) shows them: bottom right on a computer, bottom centre above the tab bar on a phone.
 */
type Kind = "success" | "error" | "info";
type Item =
  | { id: number; kind: Kind; text: string }
  | { id: number; kind: "ask"; text: string; ok?: string; danger?: boolean; answer: (yes: boolean) => void };

let items: Item[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const remove = (id: number) => {
  items = items.filter((x) => x.id !== id);
  emit();
};

export function toast(text: string, kind: Kind = "success", ms = kind === "error" ? 6000 : 3500) {
  const id = next++;
  items = [...items.slice(-4), { id, kind, text }];
  emit();
  setTimeout(() => remove(id), ms);
}

/** A confirmation: resolves true for OK, false for Cancel / Escape. */
export function ask(text: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const id = next++;
    items = [...items, { id, kind: "ask", text, ...opts, answer: (yes) => (remove(id), resolve(yes)) }];
    emit();
  });
}

const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export default function Toaster() {
  const t = useTranslations("app");
  const list = useSyncExternalStore(subscribe, () => items, () => items);
  const asking = list.filter((x) => x.kind === "ask");
  const top = asking[asking.length - 1];
  const okRef = useRef<HTMLButtonElement>(null);

  // the newest question takes the keys: Escape = Cancel, Enter = OK (its OK button has the focus)
  useEffect(() => {
    if (!top || top.kind !== "ask") return;
    okRef.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && top.answer(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [top]);

  if (!list.length) return null;
  const tone: Record<Kind, string> = {
    success: "border-green-500/40 text-green-800 dark:text-green-300",
    error: "border-red-500/40 text-red-700 dark:text-red-300",
    info: "border-line text-ink",
  };
  const icon: Record<Kind, string> = { success: "✓", error: "!", info: "i" };
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-5 md:items-end md:px-0"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
    >
      {list.map((x) =>
        x.kind === "ask" ? (
          <div key={x.id} role="alertdialog" aria-modal="false" aria-label={x.text} className="pointer-events-auto w-full max-w-sm rounded-2xl border border-line bg-card p-4 shadow-xl">
            <p className="text-sm">{x.text}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => x.answer(false)} className="btn btn-sm btn-ghost">
                {t("cancel")}
              </button>
              <button ref={x === top ? okRef : undefined} onClick={() => x.answer(true)} className={`btn btn-sm ${x.danger ? "btn-danger" : "btn-primary"}`}>
                {x.ok ?? (x.danger ? t("delete") : t("ok"))}
              </button>
            </div>
          </div>
        ) : (
          <div key={x.id} role={x.kind === "error" ? "alert" : "status"} className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-card px-4 py-3 text-sm shadow-lg ${tone[x.kind]}`}>
            <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-bold">
              {icon[x.kind]}
            </span>
            <span className="min-w-0 flex-1 text-ink">{x.text}</span>
            <button onClick={() => remove(x.id)} aria-label={t("close")} className="text-muted hover:text-ink">
              ✕
            </button>
          </div>
        ),
      )}
    </div>
  );
}
