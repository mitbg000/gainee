"use client";

import { useEffect, useId, useRef, useState } from "react";

/** An "i" that shows a longer explanation on hover or tap (tap again, Escape or a tap outside closes it). */
export default function Info({ text, label, align = "left" }: { text: React.ReactNode; /** accessible name, e.g. "How to write questions" */ label: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const id = useId();
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
    <span ref={box} className="group/info relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className={`flex size-5 items-center justify-center rounded-full border text-[11px] font-bold italic leading-none transition-colors ${open ? "border-accent bg-accent text-on-accent" : "border-line text-muted hover:border-accent hover:text-accent"}`}
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute top-full z-40 mt-1.5 w-72 max-w-[80vw] rounded-xl border border-line bg-card p-3 text-xs font-normal not-italic leading-relaxed text-ink shadow-lg ${align === "right" ? "right-0" : "left-0"} ${open ? "block" : "hidden group-hover/info:block"}`}
      >
        {text}
      </span>
    </span>
  );
}
