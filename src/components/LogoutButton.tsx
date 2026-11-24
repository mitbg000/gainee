"use client";

import { useTranslations } from "next-intl";
import { logout } from "@/lib/logout";

export default function LogoutButton() {
  const t = useTranslations("nav");
  return (
    <button
      className="text-sm text-muted hover:text-ink"
      onClick={logout}
    >
      {t("logout")}
    </button>
  );
}
