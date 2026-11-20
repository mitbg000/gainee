"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { TreeDoc } from "@/lib/documents/queries";

/** Nested under "Library" in the sidebar: text → lessons. The text holding the current page is open by default. */
export default function LessonTree({ docs }: { docs: TreeDoc[] }) {
  const path = usePathname();
  const [manual, setManualState] = useState<Record<number, boolean>>({});
  // kept across pages (each page mounts a new sidebar)
  useEffect(() => {
    try {
      setManualState(JSON.parse(localStorage.getItem("sb_tree_open") ?? "{}"));
    } catch {}
  }, []);
  const setManual = (m: Record<number, boolean>) => {
    setManualState(m);
    try {
      localStorage.setItem("sb_tree_open", JSON.stringify(m));
    } catch {}
  };
  if (!docs.length) return null;

  const lessonId = /^\/lessons\/(\d+)/.exec(path)?.[1];
  const docId = /^\/library\/(\d+)/.exec(path)?.[1];

  return (
    <div className="group-data-[collapsed=true]/sb:hidden">
      <ul className="ml-5 space-y-0.5 border-l border-line pl-1 text-sm">
        {docs.map((d) => {
          const current = String(d.id) === docId || d.lessons.some((l) => String(l.id) === lessonId);
          const open = manual[d.id] ?? current;
          return (
            <li key={d.id}>
              <div className={`flex items-center rounded-lg ${current ? "bg-accent/10" : "hover:bg-paper"}`}>
                <button
                  onClick={() => setManual({ ...manual, [d.id]: !open })}
                  aria-expanded={open}
                  aria-label={d.title}
                  className="flex h-8 w-7 flex-none items-center justify-center text-muted"
                >
                  <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
                </button>
                <Link href={`/library/${d.id}`} title={d.title} className={`min-w-0 flex-1 truncate py-1.5 pr-2 ${current ? "font-semibold text-accent" : ""}`}>
                  {d.title}
                </Link>
              </div>
              {open && (
                <ul className="ml-3.5 border-l border-line pl-1">
                  {d.lessons.map((l) => {
                    const active = String(l.id) === lessonId;
                    return (
                      <li key={l.id}>
                        <Link
                          href={`/lessons/${l.id}`}
                          title={l.title}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${active ? "bg-accent/10 font-semibold text-accent" : "text-muted hover:bg-paper hover:text-ink"}`}
                        >
                          <span className="w-4 flex-none text-center text-xs">{l.done ? "✓" : l.position}</span>
                          <span className="truncate">{l.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
