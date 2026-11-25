"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { uploadAudio } from "./ImportBook";
import * as I from "@/components/icons";

/** Book page tools: live progress while the worker reads the book, read again, add audio, delete. */
export default function BookActions({ id, status, hasTests }: { id: number; status: string; hasTests: boolean }) {
  const t = useTranslations("ielts.book");
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  const [upload, setUpload] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "parsing") return;
    const tick = setInterval(async () => {
      const r = await fetch(`/api/ielts/books/${id}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const d = await r.json();
      setProgress(d.progress);
      if (d.status !== "parsing") router.refresh();
    }, 3000);
    return () => clearInterval(tick);
  }, [id, status, router]);

  async function reimport() {
    if (hasTests && !confirm(t("reimportConfirm"))) return;
    await fetch(`/api/ielts/books/${id}/import`, { method: "POST" });
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
      {status === "parsing" && (
        <span className="flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm text-accent">
          <span className="size-2 animate-pulse rounded-full bg-accent" /> {t("parsing")} {progress && `· ${progress}`}
        </span>
      )}
      <label className="btn btn-sm btn-secondary cursor-pointer">
        <I.IconHeadphones /> {upload ?? t("addAudio")}
        <input type="file" accept="audio/*,.mp3,.m4a" multiple className="sr-only" onChange={(e) => addAudio(e.target.files)} disabled={!!upload} />
      </label>
      <button onClick={reimport} disabled={status === "parsing"} className="btn btn-sm btn-secondary">
        <I.IconRefresh /> {t("reimport")}
      </button>
      <button onClick={remove} className="btn btn-sm btn-danger">
        <I.IconTrash /> {t("delete")}
      </button>
    </div>
  );
}
