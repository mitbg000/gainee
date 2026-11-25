"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { uploadAudio } from "./ImportBook";
import * as I from "@/components/icons";

type BookJob = { id: number; type: string; status: string; progress: string | null };

/** Book page tools: the book's jobs (waiting/running, with cancel), read again, add audio, delete. */
export default function BookActions({ id, status, hasTests, brokenScripts = 0, toCheck = 0, jobs = [] }: { id: number; status: string; hasTests: boolean; brokenScripts?: number; toCheck?: number; jobs?: BookJob[] }) {
  const t = useTranslations("ielts.book");
  const router = useRouter();
  const [upload, setUpload] = useState<string | null>(null);
  const jobActive = jobs.some((j) => j.type === "ielts_import");
  const has = (type: string) => jobs.some((j) => j.type === type);

  // while jobs wait or run, the page reloads its data: progress, and the results once they are done
  useEffect(() => {
    if (!jobs.length) return;
    const tick = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(tick);
  }, [jobs.length, router]);

  async function cancel(j: BookJob) {
    if (!confirm(t("cancelConfirm"))) return;
    await fetch(`/api/jobs/${j.id}`, { method: "DELETE" });
    router.refresh();
  }

  async function reimport() {
    if (hasTests && !confirm(t("reimportConfirm"))) return;
    await fetch(`/api/ielts/books/${id}/import`, { method: "POST" });
    router.refresh();
  }
  /** Carry on after a stop or failure: parts already made are kept. */
  async function resume() {
    await fetch(`/api/ielts/books/${id}/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resume: true }) });
    router.refresh();
  }
  const stuck = !jobActive && (status === "parsing" || status === "failed");
  async function fixScripts() {
    await fetch(`/api/ielts/books/${id}/fix-scripts`, { method: "POST" });
    router.refresh();
  }
  async function check() {
    await fetch(`/api/ielts/books/${id}/check`, { method: "POST" });
    router.refresh();
  }
  async function remove() {
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/ielts/books/${id}`, { method: "DELETE" });
    router.push("/ielts");
  }
  async function addAudio(files: FileList | null) {
    try {
      for (const f of Array.from(files ?? [])) await uploadAudio(id, f, (p) => setUpload(`${f.name} ${Math.round(p * 100)}%`));
      setUpload(null);
      router.refresh();
    } catch (e) {
      setUpload(String(e));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {jobs.map((j) => (
        <span key={j.id} className="flex items-center gap-2 rounded-full bg-accent/10 py-1 pl-3 pr-1 text-sm text-accent">
          <span className={`size-2 rounded-full bg-accent ${j.status === "running" ? "animate-pulse" : "opacity-40"}`} />
          {t(`job.${j.type}`)} · {j.status === "queued" ? t("jobQueued") : (j.progress ?? "…")}
          <button onClick={() => cancel(j)} className="rounded-full px-2 py-0.5 text-xs hover:bg-accent/15">
            {t("cancel")}
          </button>
        </span>
      ))}
      <label className="btn btn-sm btn-secondary cursor-pointer">
        <I.IconHeadphones /> {upload ?? t("addAudio")}
        <input type="file" accept="audio/*,.mp3,.m4a" multiple className="sr-only" onChange={(e) => addAudio(e.target.files)} disabled={!!upload} />
      </label>
      {brokenScripts > 0 && !has("ielts_fix_scripts") && (
        <button onClick={fixScripts} className="btn btn-sm btn-primary">
          <I.IconSpark /> {t("fixScripts", { n: brokenScripts })}
        </button>
      )}
      {toCheck > 0 && !jobActive && !has("ielts_check") && (
        <button onClick={check} className="btn btn-sm btn-primary">
          <I.IconSpark /> {t("check", { n: toCheck })}
        </button>
      )}
      {stuck && (
        <button onClick={resume} className="btn btn-sm btn-primary">
          <I.IconPlay /> {t("resume")}
        </button>
      )}
      <button onClick={reimport} disabled={jobActive} className="btn btn-sm btn-secondary">
        <I.IconRefresh /> {t("reimport")}
      </button>
      <button onClick={remove} className="btn btn-sm btn-danger">
        <I.IconTrash /> {t("delete")}
      </button>
    </div>
  );
}
