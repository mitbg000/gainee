"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import * as I from "@/components/icons";
import QuickMix, { type QWord } from "./QuickMix";

type Other = { term: string; pos: string | null; meaningVi: string | null; definitionEn: string | null };
type Part = "review" | "learn";

/**
 * "Quick study": two parts, one after the other – words due for review (FSRS says when), then new words.
 * A part with no words is left out; each part is about 10 questions' worth of words.
 */
export default function QuickSession({ review, learn, others, streak, activeToday, learned, skip }: { review: QWord[]; learn: QWord[]; others: Other[]; streak: number; activeToday: boolean; learned: number; skip: number[] }) {
  const t = useTranslations("learn.quick");
  const router = useRouter();
  const parts = ([["review", review], ["learn", learn]] as const).filter(([, ws]) => ws.length).map(([p]) => p as Part);
  const [i, setI] = useState(0);
  const part = parts[i];

  if (!parts.length)
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-dashed border-line bg-card p-8 text-center">
        <I.BigIcon icon={I.IconWords} />
        <p className="mt-3 font-semibold">{t(skip.length ? "allDone" : "nothing")}</p>
        <Link href="/library" className="btn btn-primary mt-4">
          {t("goRead")}
        </Link>
      </div>
    );

  return (
    <div>
      <ol className="mx-auto mb-6 flex max-w-2xl items-center gap-2 text-sm">
        {parts.map((p, k) => (
          <li key={p} className="flex flex-1 items-center gap-2">
            <span className={`flex size-7 flex-none items-center justify-center rounded-full text-xs font-bold ${k < i ? "bg-green-500 text-white" : k === i ? "bg-accent text-on-accent" : "bg-line text-muted"}`}>
              {k < i ? <I.IconCheck className="h-3.5 w-3.5" /> : k + 1}
            </span>
            <span className={`truncate ${k === i ? "font-semibold" : "text-muted"}`}>{t(`part.${p}`, { n: (p === "review" ? review : learn).length })}</span>
            {k < parts.length - 1 && <span className="h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>

      {part ? (
        <QuickMix key={part} kind={part} words={part === "review" ? review : learn} others={others} onDone={() => setI(i + 1)} doneLabel={i + 1 < parts.length ? t(`toPart.${parts[i + 1]}`) : t("finish")} />
      ) : (
        <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-8 text-center">
          <I.BigIcon icon={I.IconFlame} tone="orange" />
          <p className="mt-3 font-serif text-3xl font-bold">{t("streak", { n: activeToday ? streak : streak + 1 })}</p>
          <p className="mt-2 text-muted">{t("doneTip", { known: learned })}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button onClick={() => router.push(`/quick?skip=${[...skip, ...[...review, ...learn].map((w) => w.id)].slice(-300).join(",")}`)} className="btn btn-primary">
              {t("again")}
            </button>
            <Link href="/progress" className="btn btn-secondary">
              {t("seeProgress")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
