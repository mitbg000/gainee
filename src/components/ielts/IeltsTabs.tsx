import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Tabs between the IELTS test books and the attempt history. */
export default async function IeltsTabs({ active }: { active: "books" | "history" }) {
  const t = await getTranslations("ielts");
  const tabs = [
    ["books", "/ielts", t("tabBooks")],
    ["history", "/ielts/history", t("history")],
  ] as const;
  return (
    <nav className="mt-5 flex gap-1 border-b border-line">
      {tabs.map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${active === key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
