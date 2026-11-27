"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small menu under a button (language, theme): closes on outside click, Escape and choosing.
 * `trigger` is the button's content; `items` the choices, the current one ticked.
 */
export default function Dropdown<T extends string>({ label, trigger, items, value, onPick, align = "right", className = "" }: { label: string; trigger: React.ReactNode; items: { value: T; label: string; icon?: React.ReactNode }[]; value: T; onPick: (v: T) => void; align?: "left" | "right"; className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink ${open ? "bg-ink/5 text-ink" : ""}`}
      >
        {trigger}
      </button>
      {open && (
        <div role="menu" aria-label={label} className={`absolute top-full z-50 mt-1.5 min-w-44 rounded-xl border border-line bg-card p-1 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>
          {items.map((it) => (
            <button
              key={it.value}
              type="button"
              role="menuitemradio"
              aria-checked={it.value === value}
              onClick={() => {
                setOpen(false);
                onPick(it.value);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-paper ${it.value === value ? "font-semibold text-ink" : "text-muted"}`}
            >
              {it.icon}
              <span className="flex-1">{it.label}</span>
              {it.value === value && (
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12l5 5L20 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Segmented control (inside menus and settings): a light track, the chosen option raised. */
export function Segmented<T extends string>({ label, items, value, onPick, disabled }: { label: string; items: { value: T; label: string; content: React.ReactNode }[]; value: T; onPick: (v: T) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-ink/5 p-0.5">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="radio"
          aria-checked={it.value === value}
          aria-label={it.label}
          title={it.label}
          disabled={disabled}
          onClick={() => onPick(it.value)}
          className={`flex h-7 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition ${
            it.value === value ? "bg-card text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"
          }`}
        >
          {it.content}
        </button>
      ))}
    </div>
  );
}
