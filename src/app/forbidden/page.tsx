import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";

/** Shown (by the middleware) for pages the user's role does not open. */
export default async function Forbidden() {
  const t = await getTranslations("admin");
  return (
    <Shell>
      <div className="rounded-3xl border border-line bg-card p-10 text-center">
        <p className="font-serif text-2xl font-bold">{t("forbiddenTitle")}</p>
        <p className="mt-2 text-sm text-muted">{t("forbiddenHint")}</p>
        <Link href="/" className="btn btn-secondary mt-5">
          {t("home")}
        </Link>
      </div>
    </Shell>
  );
}
