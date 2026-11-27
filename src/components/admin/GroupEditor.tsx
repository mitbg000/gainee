"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import Switches from "./Switches";

type G = { id: number; name: string; features: Record<string, boolean> | null; members: number[] };
const json = (method: string, body?: unknown) => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

/** Learner groups: name, members, feature switches for all members. Texts are shown to groups on the text's own page. */
export default function GroupEditor({ groups, users, features }: { groups: G[]; users: { id: number; label: string }[]; features: readonly string[] }) {
  const t = useTranslations("admin.groups");
  const router = useRouter();
  const [name, setName] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  async function create() {
    if (!name.trim()) return;
    const r = await fetch("/api/admin/groups", json("POST", { name }));
    if (r.ok) {
      setName("");
      setOpen((await r.json()).id);
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t("hint")}</p>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={t("newName")} className="field min-w-0 flex-1" onKeyDown={(e) => e.key === "Enter" && create()} />
        <button onClick={create} disabled={!name.trim()} className="btn btn-primary">
          {t("create")}
        </button>
      </div>
      {groups.map((g) => (
        <Group key={g.id} g={g} users={users} features={features} open={open === g.id} onToggle={() => setOpen(open === g.id ? null : g.id)} />
      ))}
      {!groups.length && <p className="text-sm text-muted">{t("none")}</p>}
    </div>
  );
}

function Group({ g, users, features, open, onToggle }: { g: G; users: { id: number; label: string }[]; features: readonly string[]; open: boolean; onToggle: () => void }) {
  const t = useTranslations("admin.groups");
  const router = useRouter();
  const [name, setName] = useState(g.name);
  const [feat, setFeat] = useState(g.features ?? {});
  const [members, setMembers] = useState(g.members);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");

  async function save() {
    const r = await fetch(`/api/admin/groups/${g.id}`, json("PATCH", { name, features: Object.keys(feat).length ? feat : null, members }));
    setMsg(r.ok ? t("saved") : t("error"));
    router.refresh();
  }
  async function remove() {
    if (!confirm(t("deleteConfirm", { name: g.name }))) return;
    await fetch(`/api/admin/groups/${g.id}`, json("DELETE"));
    router.refresh();
  }
  const list = users.filter((u) => !q || u.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="rounded-2xl border border-line bg-card">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex-1 font-semibold">{g.name}</span>
        <span className="text-xs text-muted">{t("members", { n: g.members.length })}</span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-line p-4 md:grid-cols-2">
          <div>
            <label className="block text-sm">
              {t("name")}
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="field mt-1 w-full" />
            </label>
            <p className="mt-3 text-sm font-semibold">{t("features")}</p>
            <div className="mt-1">
              <Switches value={feat} onChange={setFeat} keys={features} />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">{t("membersTitle", { n: members.length })}</p>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="field-sm mt-1 w-full" />
            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {list.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={members.includes(u.id)} onChange={(e) => setMembers(e.target.checked ? [...members, u.id] : members.filter((m) => m !== u.id))} />
                  <span className="truncate">{u.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <button onClick={save} disabled={!name.trim()} className="btn btn-primary">
              {t("save")}
            </button>
            <button onClick={remove} className="btn btn-ghost text-red-600">
              {t("delete")}
            </button>
            {msg && <span className="text-sm text-muted">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
