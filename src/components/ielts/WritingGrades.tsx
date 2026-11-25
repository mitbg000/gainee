"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import Markdown from "@/components/lesson/Markdown";

type W = { writingId: number; part: number; words: number; band: number | null; feedback: string | null };

/** Writing tasks of a mock test: graded by AI when the result page opens (once), then Task 2 counts double. */
export default function WritingGrades({ items }: { items: W[] }) {
  const t = useTranslations("ielts.result");
  const [rows, setRows] = useState(items);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    items.forEach(async (w) => {
      if (w.band != null) return;
      const r = await fetch(`/api/writings/${w.writingId}/grade`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
      if (!r?.ok) return setError(r?.status === 409 ? t("noAi") : t("gradeFailed"));
      const g = (await r.json()) as { overall: number; feedback: string };
      setRows((rs) => {
        const next = rs.map((x) => (x.writingId === w.writingId ? { ...x, band: g.overall, feedback: g.feedback } : x));
        if (next.every((x) => x.band != null)) setTimeout(() => router.refresh(), 0); // the server stores the final band
        return next;
      });
    });
  }, [items, t, router]);

  const t1 = rows.find((r) => r.part === 1)?.band;
  const t2 = rows.find((r) => r.part === 2)?.band;
  const total = t1 != null && t2 != null ? Math.round(((t1 + 2 * t2) / 3) * 2) / 2 : null;

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="flex items-baseline gap-3">
        <h2 className="flex-1 text-lg font-bold">Writing</h2>
        <span className="text-3xl font-bold">{total ?? "…"}</span>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!rows.length && <p className="mt-2 text-sm text-muted">{t("noWriting")}</p>}
      {rows.map((w) => (
        <details key={w.writingId} className="mt-3 rounded-xl bg-paper p-3">
          <summary className="cursor-pointer font-semibold">
            Task {w.part} · {w.words} {t("words")} · {w.band != null ? `Band ${w.band}` : error ? "—" : t("grading")}
          </summary>
          {w.feedback && <Markdown text={w.feedback} className="mt-2 text-[15px]" />}
          <Link href={`/writing?id=${w.writingId}`} className="mt-2 inline-block text-sm text-accent underline">
            {t("openWriting")}
          </Link>
        </details>
      ))}
    </div>
  );
}
