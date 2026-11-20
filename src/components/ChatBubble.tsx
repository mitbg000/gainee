"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import AssistantChat from "@/components/AssistantChat";
import type { TreeDoc } from "@/lib/documents/queries";
import * as I from "@/components/icons";

/** Floating AI assistant on every page; on a lesson page that lesson is the chat's context. */
export default function ChatBubble({ docs }: { docs: TreeDoc[] }) {
  const t = useTranslations("assistant");
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // keep the conversation after closing the panel
  if (path.startsWith("/assistant")) return null;
  const lessonId = Number(/^\/lessons\/(\d+)/.exec(path)?.[1]) || null;

  return (
    <>
      {mounted && (
        <div
          role="dialog"
          aria-label={t("title")}
          className={`fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] z-50 h-[min(40rem,calc(100dvh-9rem))] w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl md:right-6 md:bottom-24 ${open ? "flex" : "hidden"}`}
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <b className="text-sm"><I.IconSpark className="inline-block h-4 w-4 align-[-0.2em]" /> {t("title")}</b>
            <button onClick={() => setOpen(false)} aria-label={t("close")} className="icon-btn">
              <I.IconClose className="inline-block h-4 w-4 align-[-0.2em]" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AssistantChat docs={docs} initialLessonId={lessonId} compact />
          </div>
        </div>
      )}
      <button
        onClick={() => {
          setMounted(true);
          setOpen(!open);
        }}
        aria-label={t("title")}
        aria-expanded={open}
        title={t("title")}
        className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl text-on-accent shadow-xl transition hover:scale-105 md:right-6 md:bottom-6"
      >
        {open ? <I.IconClose className="h-6 w-6" /> : <I.IconSpark className="h-7 w-7" />}
      </button>
    </>
  );
}
