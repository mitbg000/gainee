"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import Match from "@/components/practice/Match";
import { shuffle, type PWord } from "@/components/practice/questions";
import ReviewSession from "@/components/review/ReviewSession";
import SentencePractice from "./SentencePractice";

const STEPS = ["review", "write", "match", "done"] as const;
type Step = (typeof STEPS)[number];

/**
 * "Quick study" – about five minutes, the same order every day: due cards first (spaced repetition),
 * then two sentences of your own (deep processing), then a timed match (fun, fast recall).
 */
export default function QuickSession({ pool, streak, activeToday, known }: { pool: PWord[]; streak: number; activeToday: boolean; known: number }) {
  const t = useTranslations("learn.quick");
  const [step, setStep] = useState<Step>("review");
  // picked once per session: two recent words to write with, six for the match
  const [picks] = useState(() => {
    const s = shuffle(pool);
    return { write: s.slice(0, 2), match: shuffle(pool).slice(0, 6) };
  });
  const next = () => setStep((s) => STEPS[Math.min(STEPS.indexOf(s) + 1, STEPS.length - 1)]);
  const i = STEPS.indexOf(step);

  return (
    <div>
      <ol className="mx-auto mb-6 flex max-w-2xl items-center gap-2 text-sm">
        {STEPS.slice(0, 3).map((s, k) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={`flex size-7 flex-none items-center justify-center rounded-full text-xs font-bold ${k < i ? "bg-green-500 text-white" : k === i ? "bg-accent text-on-accent" : "bg-line text-muted"}`}
            >
              {k < i ? "✓" : k + 1}
            </span>
            <span className={`truncate ${k === i ? "font-semibold" : "text-muted"}`}>{t(`step.${s}`)}</span>
            {k < 2 && <span className="h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>

      {step === "review" && <ReviewSession limit={8} onDone={next} />}
      {step === "write" && (picks.write.length ? <SentencePractice words={picks.write} onDone={next} /> : <Skip onNext={next} />)}
      {step === "match" &&
        (picks.match.length >= 2 ? (
          <div>
            <Match words={picks.match} onExit={next} />
            <div className="mt-4 text-center">
              <button onClick={next} className="btn btn-primary">
                {t("finish")}
              </button>
            </div>
          </div>
        ) : (
          <Skip onNext={next} />
        ))}
      {step === "done" && (
        <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-8 text-center">
          <p className="text-5xl">🔥</p>
          <p className="mt-3 font-serif text-3xl font-bold">{t("streak", { n: activeToday ? streak : streak + 1 })}</p>
          <p className="mt-2 text-muted">{t("doneTip", { known })}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/progress" className="btn btn-primary">
              {t("seeProgress")}
            </Link>
            <Link href="/practice" className="btn btn-secondary">
              {t("more")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Skip({ onNext }: { onNext: () => void }) {
  const t = useTranslations("learn.quick");
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-8 text-center">
      <p className="text-muted">{t("notEnough")}</p>
      <button onClick={onNext} autoFocus className="btn btn-primary mt-4">
        {t("continue")}
      </button>
    </div>
  );
}
