"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import * as I from "@/components/icons";

export type CutJob = { id: number; status: string; progress: string | null } | null;
const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Refresh the page every few seconds while a cut is waiting or running (one per page). */
function useRefreshWhile(active: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [active, router]);
}

/** "2/16 · listen 3/15" → "Part 2/16: nghe 3/15" */
function JobState({ job }: { job: NonNullable<CutJob> }) {
  const t = useTranslations("listen.ielts");
  const router = useRouter();
  const m = job.progress?.match(/^(\d+)\/(\d+) · (\w+)(?: (\d+)\/(\d+))?/);
  const step = m ? t(`step.${m[3] === "listen" ? "listen" : "decode"}`, { n: m[4] ?? 0, total: m[5] ?? 0 }) : "";
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="animate-pulse text-muted">
        {job.status === "queued" ? t("queued") : m ? t("running", { k: m[1], n: m[2], step }) : t("starting")}
      </span>
      <button
        onClick={async () => {
          if (!confirm(t("cancelConfirm"))) return;
          await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
          router.refresh();
        }}
        className="btn btn-sm btn-ghost"
      >
        {t("cancel")}
      </button>
    </span>
  );
}

export function RefreshWhile({ active }: { active: boolean }) {
  useRefreshWhile(active);
  return null;
}

/**
 * IELTS Listening part → listening bank. The server's worker does it (ffmpeg + Whisper + matching to the audioscript),
 * so this page can be closed meanwhile.
 */
export default function IeltsToBank({ sectionId, hasScript, sourceId, job, refresh = true }: { sectionId: number; hasScript: boolean; sourceId: number | null; job: CutJob; /** false in lists: the page refreshes once for all rows */ refresh?: boolean }) {
  const t = useTranslations("listen.ielts");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useRefreshWhile(refresh && !!job);

  async function run() {
    if (sourceId && !confirm(t("redoConfirm"))) return;
    setError(null);
    const r = await fetch("/api/listen/ielts", json({ sectionIds: [sectionId] })).catch(() => null);
    if (!r?.ok) return setError(t("failed", { error: (await r?.json().catch(() => ({})))?.error ?? "network" }));
    router.refresh();
  }

  if (!hasScript) return <span className="text-xs text-muted">{t("noScript")}</span>;
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      {sourceId && (
        <Link href={`/listen/${sourceId}`} className="btn btn-sm btn-secondary">
          <I.IconHeadphones /> {t("open")}
        </Link>
      )}
      {job ? (
        <JobState job={job} />
      ) : (
        <button onClick={run} className="btn btn-sm btn-ghost" title={t("hint")}>
          <I.IconPen /> {sourceId ? t("redo") : t("add")}
        </button>
      )}
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}

/** Every part of a book that is not in the bank yet, in one job. */
export function CutBook({ bookId, left }: { bookId: number; left: number }) {
  const t = useTranslations("listen.ielts");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!left) return null;
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/listen/ielts", json({ bookId })).catch(() => null);
        setBusy(false);
        router.refresh();
      }}
      className="btn btn-sm btn-secondary"
    >
      <I.IconHeadphones /> {t("addBook", { n: left })}
    </button>
  );
}
