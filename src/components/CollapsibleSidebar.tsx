"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** Desktop sidebar that can shrink to an icon rail; the choice is remembered. Children hide text with `group-data-[collapsed=true]/sb:hidden`. */
export default function CollapsibleSidebar({ children }: { children: React.ReactNode }) {
  const t = useTranslations("nav");
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar_collapsed") === "1");
    } catch {}
  }, []);
  const toggle = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem("sidebar_collapsed", collapsed ? "0" : "1");
    } catch {}
  };

  return (
    <aside
      data-collapsed={collapsed}
      className={`chrome group/sb hidden border-r border-line bg-card p-4 transition-[width] md:sticky md:top-0 md:flex md:h-dvh md:flex-none md:flex-col ${collapsed ? "md:w-[4.5rem] md:px-2" : "md:w-64"}`}
    >
      {children}
      <button
        onClick={toggle}
        aria-label={collapsed ? t("expand") : t("collapse")}
        title={collapsed ? t("expand") : t("collapse")}
        className={`icon-btn mt-3 ${collapsed ? "mx-auto" : "self-end"}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
        </svg>
      </button>
    </aside>
  );
}
