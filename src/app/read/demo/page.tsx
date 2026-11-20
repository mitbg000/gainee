import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import ReaderLookup from "@/components/reader/ReaderLookup";

/** Demo of the reader look-up until real lessons exist (Phase 1). Original sample text. */
const SAMPLE = [
  "Most people who study a language reach a point where their progress seems to stop. They have remembered thousands of words, yet real articles still feel slow and heavy. This stage is often called a plateau, and it is a normal part of learning.",
  "Researchers who have studied expert performers suggest a simple idea: practice that feels comfortable rarely makes us better. Musicians, athletes and surgeons improve when someone else watches them, points out small habits they cannot see, and helps them take off in a new direction.",
  "Reading is no different. If you stopped every time you met an unknown word, you would lose the thread of the story. A better habit is to read the whole paragraph first, guess the meaning from context, and only then check the dictionary – the way you might bite into an apple before deciding whether you like the fruit.",
  "Over weeks and months, the number of words you need to look up falls. That quiet change, more than any test score, is the real sign that your English is growing – a small piece of serendipity that comes from showing up every day.",
];

export default async function ReaderDemoPage() {
  const t = await getTranslations("reader");
  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-widest text-accent2">{t("demoTitle")}</p>
      <h1 className="mt-1 font-serif text-3xl font-bold md:text-4xl">{t("tryTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("tryIntro")}</p>
      <ReaderLookup className="mt-6 rounded-2xl border border-line bg-card p-5 md:p-8">
        <article className="font-serif text-[19px] leading-[1.75] md:text-[20px]">
          {SAMPLE.map((p, i) => (
            <p key={i} className="mb-5 last:mb-0">
              {p}
            </p>
          ))}
        </article>
      </ReaderLookup>
    </Shell>
  );
}
