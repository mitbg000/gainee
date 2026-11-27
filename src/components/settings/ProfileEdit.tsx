"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import type { Profile } from "@/lib/profile";
import * as I from "@/components/icons";

const LEVELS = ["B1", "B2", "C1", "C2"] as const;
const BANDS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];
const WORDS = [400, 500, 650, 800, 1000];

/**
 * The top of the profile page: picture (click to change), name and a one-line learning profile.
 * Edit opens one form (display name + learning profile) saved together.
 */
export default function ProfileEdit({ avatar, name, email, sub, profile, stats }: { avatar: string | null; name: string; email: string; /** role · groups */ sub: string; profile: Profile; /** credits and tokens, beside the name */ stats?: React.ReactNode }) {
  const t = useTranslations("profile");
  const tp = useTranslations("settings.profile");
  const ta = useTranslations("settings.avatar");
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pic, setPic] = useState(avatar);
  const [picState, setPicState] = useState<"" | "busy" | "error">("");
  const [form, setForm] = useState({ name, ...profile });
  const [state, setState] = useState<"" | "saving" | "error">("");
  useEffect(() => {
    if (location.hash === "#me") setOpen(true); // old "/settings?tab=profile" links land here
  }, []);

  async function upload(f: File) {
    setPicState("busy");
    const body = new FormData();
    body.set("file", f);
    const r = await fetch("/api/settings/avatar", { method: "POST", body }).catch(() => null);
    if (!r?.ok) return setPicState("error");
    setPic((await r.json()).url);
    setPicState("");
    router.refresh();
  }
  async function removePic() {
    await fetch("/api/settings/avatar", { method: "DELETE" });
    setPic(null);
    router.refresh();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const put = (url: string, body: unknown) => fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const { name: n, ...p } = form;
    const [a, b] = await Promise.all([put("/api/settings/account", { name: n }), put("/api/settings/profile", p)]);
    if (!a?.ok || !b?.ok) return setState("error");
    setState("");
    setOpen(false);
    router.refresh();
  }
  const cancel = () => {
    setForm({ name, ...profile });
    setState("");
    setOpen(false);
  };

  const facts = [`${tp("levelShort")} ${profile.level}`, `${tp("bandShort")} ${profile.targetBand}`, `${tp("explainShort")} ${profile.explainIn === "vi" ? "Tiếng Việt" : "English"}`, tp("wordsShort", { n: profile.lessonWords })];
  const field = (id: string, label: string, control: React.ReactNode) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {control}
    </div>
  );
  const select = <T extends string | number>(id: keyof typeof form, options: readonly T[], show: (v: T) => string = String) => (
    <select id={id} value={String(form[id])} onChange={(e) => setForm({ ...form, [id]: typeof options[0] === "number" ? Number(e.target.value) : e.target.value })} className="field w-full">
      {options.map((o) => (
        <option key={String(o)} value={String(o)}>
          {show(o)}
        </option>
      ))}
    </select>
  );

  return (
    <section id="me" className="scroll-mt-20 rounded-2xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-center gap-4">
        {/* the picture: click to change */}
        <div className="group relative">
          <button type="button" onClick={() => file.current?.click()} disabled={picState === "busy"} aria-label={ta("change")} title={ta("change")} className="block rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <Avatar url={pic} name={name || email} className={`size-16 text-2xl ${picState === "busy" ? "opacity-50" : ""}`} />
            <span className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full border-2 border-card bg-ink text-paper">
              <I.IconEdit className="h-3 w-3" />
            </span>
          </button>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="break-words font-serif text-2xl font-bold md:text-3xl">{name || email}</h1>
          <p className="break-words text-sm text-muted">{sub}</p>
          {picState === "error" && <p className="text-xs text-red-600">{ta("error")}</p>}
        </div>
        {stats}
        {!open && (
          <button onClick={() => setOpen(true)} className="btn btn-sm btn-secondary">
            <I.IconEdit /> {t("edit")}
          </button>
        )}
      </div>

      {!open ? (
        <ul className="mt-4 flex flex-wrap gap-1.5 text-xs">
          {facts.map((x) => (
            <li key={x} className="rounded-full bg-paper px-2.5 py-1 text-muted">
              {x}
            </li>
          ))}
        </ul>
      ) : (
        <form onSubmit={save} className="mt-5 border-t border-line pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("name", ta("name"), <input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} placeholder={email} className="field w-full" />)}
            {field(
              "email",
              "Email",
              <p id="email" className="flex min-h-10 items-center text-sm text-muted">
                {email}
              </p>,
            )}
            {field("level", tp("level"), select("level", LEVELS))}
            {field("targetBand", tp("targetBand"), select("targetBand", BANDS))}
            {field("explainIn", tp("explainIn"), select("explainIn", ["vi", "en"] as const, (v) => (v === "vi" ? "Tiếng Việt" : "English")))}
            {field("lessonWords", tp("lessonWords"), select("lessonWords", WORDS, (n) => `~${n}`))}
          </div>
          <p className="mt-3 text-xs text-muted">{tp("hint")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button disabled={state === "saving"} className="btn btn-primary">
              {state === "saving" ? t("saving") : t("save")}
            </button>
            <button type="button" onClick={cancel} className="btn btn-ghost">
              {t("cancel")}
            </button>
            {pic && (
              <button type="button" onClick={removePic} className="btn btn-ghost ml-auto text-red-600">
                {ta("remove")}
              </button>
            )}
            {state === "error" && <span className="text-sm text-red-600">{t("saveError")}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
