"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import Avatar from "@/components/Avatar";

/** Upload or remove the account's picture (shown in the top bar and to the admin). */
export default function AvatarSettings({ url, name }: { url: string | null; name: string | null }) {
  const t = useTranslations("settings.avatar");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [cur, setCur] = useState(url);
  const [state, setState] = useState<"" | "busy" | "error">("");

  async function upload(file: File) {
    setState("busy");
    const body = new FormData();
    body.set("file", file);
    const r = await fetch("/api/settings/avatar", { method: "POST", body }).catch(() => null);
    if (!r?.ok) return setState("error");
    setCur((await r.json()).url);
    setState("");
    router.refresh();
  }
  async function remove() {
    await fetch("/api/settings/avatar", { method: "DELETE" });
    setCur(null);
    router.refresh();
  }

  return (
    <section className="mb-6">
      <h2 className="font-serif text-xl font-bold">{t("title")}</h2>
      <div className="mt-3 flex items-center gap-4 rounded-2xl border border-line bg-card p-4">
        <Avatar url={cur} name={name} className="size-16 text-2xl" />
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button onClick={() => input.current?.click()} disabled={state === "busy"} className="btn btn-sm btn-secondary">
            {state === "busy" ? t("uploading") : t("change")}
          </button>
          {cur && (
            <button onClick={remove} className="btn btn-sm btn-ghost">
              {t("remove")}
            </button>
          )}
          {state === "error" && <span className="text-sm text-red-600">{t("error")}</span>}
        </div>
      </div>
    </section>
  );
}
