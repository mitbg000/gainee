"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import Avatar from "@/components/Avatar";

/** The account's picture and display name, on the profile page. */
export default function AccountSettings({ avatar, name, email }: { avatar: string | null; name: string; email: string }) {
  const t = useTranslations("settings.avatar");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [cur, setCur] = useState(avatar);
  const [n, setN] = useState(name);
  const [state, setState] = useState<"" | "busy" | "error" | "saved">("");

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
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/settings/account", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: n }) }).catch(() => null);
    setState(r?.ok ? "saved" : "error");
    if (r?.ok) router.refresh();
  }

  return (
    <section>
      <h2 className="font-serif text-xl font-bold">{t("title")}</h2>
      <div className="mt-3 space-y-4 rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center gap-4">
          <Avatar url={cur} name={n || email} className="size-16 text-2xl" />
          <div className="flex flex-wrap gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <button type="button" onClick={() => input.current?.click()} disabled={state === "busy"} className="btn btn-sm btn-secondary">
              {state === "busy" ? t("uploading") : t("change")}
            </button>
            {cur && (
              <button type="button" onClick={remove} className="btn btn-sm btn-ghost">
                {t("remove")}
              </button>
            )}
          </div>
        </div>
        <form onSubmit={saveName}>
          <label htmlFor="display-name" className="text-sm font-medium">
            {t("name")}
          </label>
          <div className="mt-1 flex gap-2">
            <input id="display-name" value={n} onChange={(e) => { setN(e.target.value); setState(""); }} maxLength={100} placeholder={email} className="field min-w-0 flex-1" />
            <button disabled={n === name} className="btn btn-secondary">
              {t("save")}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">{email}</p>
        </form>
        {state === "error" && <p className="text-sm text-red-600">{t("error")}</p>}
        {state === "saved" && <p className="text-sm text-green-700 dark:text-green-400">{t("saved")}</p>}
      </div>
    </section>
  );
}
