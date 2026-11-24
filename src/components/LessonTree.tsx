"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TreeDoc } from "@/lib/documents/queries";

/** Under "Library" in the sidebar: one link per text (two levels only); its parts are on the text's page and the lesson header. */
export default function LessonTree({ docs }: { docs: TreeDoc[] }) {
  const path = usePathname();
  if (!docs.length) return null;

  const lessonId = /^\/lessons\/(\d+)/.exec(path)?.[1];
  const docId = /^\/library\/(\d+)/.exec(path)?.[1];

  return (
    <ul className="ml-5 space-y-0.5 border-l border-line pl-1 text-sm group-data-[collapsed=true]/sb:hidden">
      {docs.map((d) => {
        const current = String(d.id) === docId || d.lessons.some((l) => String(l.id) === lessonId);
        const done = d.lessons.filter((l) => l.done).length;
        return (
          <li key={d.id}>
            <Link
              href={`/library/${d.id}`}
              title={d.title}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${current ? "bg-accent/10 font-semibold text-accent" : "text-muted hover:bg-paper hover:text-ink"}`}
            >
              <span className="min-w-0 flex-1 truncate">{d.title}</span>
              {d.lessons.length > 0 && (
                <span className={`flex-none text-[11px] tabular-nums ${done === d.lessons.length ? "text-green-600 dark:text-green-400" : "opacity-70"}`}>
                  {done === d.lessons.length ? "✓" : `${done}/${d.lessons.length}`}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
