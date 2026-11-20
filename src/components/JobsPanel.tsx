"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

type Status = "queued" | "running" | "done" | "failed";
type Job = { id: number; type: string; status: Status; progress: string | null; error: string | null };

const COLOR: Record<Status, string> = {
  queued: "bg-paper text-muted",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  done: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export default function JobsPanel() {
  const t = useTranslations("jobs");
  const [jobs, setJobs] = useState<Job[]>([]);

  const load = useCallback(async () => {
    const r = await fetch("/api/jobs", { cache: "no-store" });
    if (r.ok) setJobs(await r.json());
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [load]);

  async function runTest() {
    await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "ping" }) });
    load();
  }

  return (
    <section className="mt-8 rounded-2xl border border-line bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold">{t("title")}</h2>
          <p className="text-sm text-muted">{t("intro")}</p>
        </div>
        <button onClick={runTest} className="btn btn-primary whitespace-nowrap">
          {t("test")}
        </button>
      </div>
      <ul className="mt-4 divide-y divide-line text-sm">
        {jobs.length === 0 && <li className="py-3 text-muted">{t("empty")}</li>}
        {jobs.map((j) => (
          <li key={j.id} className="flex items-center gap-3 py-2">
            <span className="w-10 text-muted/70">#{j.id}</span>
            <span className="font-mono">{j.type}</span>
            <span className={`rounded px-2 py-0.5 text-xs ${COLOR[j.status]}`}>{t(`status.${j.status}`)}</span>
            <span className="flex-1 truncate text-muted">{j.error || j.progress}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
