"use client";

import { useTranslations } from "next-intl";

export default function LogoutButton() {
  const t = useTranslations("nav");
  return (
    <button
      className="text-sm text-gray-500 hover:text-ink"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        location.href = "/login";
      }}
    >
      {t("logout")}
    </button>
  );
}
