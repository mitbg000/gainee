import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import Practice from "@/components/listen/Practice";
import { pickSession } from "@/lib/listen/queries";

export const dynamic = "force-dynamic";

/** A practice session across the bank: review, random (no repeats until every sentence was shown), or mixed. */
export default async function SessionPage({ searchParams }: { searchParams: Promise<{ mode?: string; scope?: string; n?: string; kind?: string }> }) {
  const t = await getTranslations("listen");
  const q = await searchParams;
  const mode = q.mode === "review" || q.mode === "mix" ? q.mode : "random";
  const n = Math.min(50, Math.max(5, Number(q.n) || 20));
  const s = await pickSession(mode, q.scope || "all", n);
  return (
    <Shell full>
      <div className="mx-auto max-w-[96rem]">
        <div className="mb-4 flex items-center gap-2">
          <Link href="/listen" className="text-sm text-muted hover:text-ink">
            ← {t("title")}
          </Link>
          <span className="text-sm font-semibold">· {t(`session.${mode}`)}</span>
        </div>
        {s.items.length ? (
          <Practice items={s.items} titles={s.titles} saved={s.saved} mode={mode === "review" ? "review" : "random"} kind={q.kind === "gaps" ? "gaps" : "dictation"} round={mode === "review" ? undefined : s.round} backHref="/listen" />
        ) : (
          <p className="rounded-2xl border border-line bg-card p-6 text-center text-muted">{t(mode === "review" ? "session.noneDue" : "session.none")}</p>
        )}
      </div>
    </Shell>
  );
}
