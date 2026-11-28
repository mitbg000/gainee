"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import * as I from "@/components/icons";

const SIZES = [10, 20, 30];
const SCOPES = ["all", "fast", "numbers"]; // as in lib/listen/queries (server only)

/** Start a session: today's review, random sentences not shown yet, or both mixed; dictation or gap filling. */
export default function Launcher({ due, sources }: { due: number; sources: { id: number; title: string }[] }) {
  const t = useTranslations("listen.launch");
  const [scope, setScope] = useState("all");
  const [n, setN] = useState(20);
  const [kind, setKind] = useState<"dictation" | "gaps">("dictation");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("rl_listen_launch") ?? "{}");
      if (SCOPES.includes(s.scope) || /^src:\d+$/.test(s.scope)) setScope(s.scope);
      if (SIZES.includes(s.n)) setN(s.n);
      if (s.kind === "gaps" || s.kind === "dictation") setKind(s.kind);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("rl_listen_launch", JSON.stringify({ scope, n, kind }));
    } catch {}
  }, [scope, n, kind]);
  const href = (mode: string) => `/listen/session?${new URLSearchParams({ mode, scope, n: String(n), kind })}`;

  const scopeName = scope.startsWith("src:") ? (sources.find((x) => `src:${x.id}` === scope)?.title ?? t("oneSource")) : t(`scopes.${scope}`);
  const row = (label: string, body: React.ReactNode) => (
    <div>
      <p className="mb-2 text-sm font-semibold">{label}</p>
      {body}
    </div>
  );
  const chip = (on: boolean) => `chip ${on ? "chip-on" : ""}`;

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">
          {scopeName} · {t("sentences", { n })} · {t(`kinds.${kind}`)}
        </span>
        <button onClick={() => setOpen(true)} className="icon-btn" aria-label={t("settings")} title={t("settings")}>
          <I.IconGear />
        </button>
      </div>
      <Link href={href("review")} className={`btn btn-lg w-full ${due ? "btn-primary" : "btn-secondary"}`} aria-disabled={!due}>
        <I.IconCards /> {t("review", { n: due })}
      </Link>
      <div className="grid grid-cols-2 gap-2">
        <Link href={href("random")} className={`btn ${due ? "btn-secondary" : "btn-primary"}`}>
          <I.IconBolt /> {t("random")}
        </Link>
        <Link href={href("mix")} className="btn btn-secondary">
          <I.IconRefresh /> {t("mix")}
        </Link>
      </div>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t("settings")} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-card p-5 shadow-xl">
            <div className="flex items-center">
              <h2 className="flex-1 font-bold">{t("settings")}</h2>
              <button onClick={() => setOpen(false)} className="icon-btn" aria-label={t("close")}>
                <I.IconX />
              </button>
            </div>
            {row(
              t("scope"),
              <>
                <div className="flex flex-wrap gap-1.5">
                  {SCOPES.map((x) => (
                    <button key={x} onClick={() => setScope(x)} className={chip(scope === x)}>
                      {t(`scopes.${x}`)}
                    </button>
                  ))}
                </div>
                {sources.length > 0 && (
                  <select value={scope.startsWith("src:") ? scope : ""} onChange={(e) => e.target.value && setScope(e.target.value)} className="field field-sm mt-2 w-full" aria-label={t("oneSource")}>
                    <option value="">{t("oneSource")}…</option>
                    {sources.map((x) => (
                      <option key={x.id} value={`src:${x.id}`}>
                        {x.title}
                      </option>
                    ))}
                  </select>
                )}
              </>,
            )}
            {row(
              t("size"),
              <div className="flex flex-wrap gap-1.5">
                {SIZES.map((x) => (
                  <button key={x} onClick={() => setN(x)} className={chip(n === x)}>
                    {t("sentences", { n: x })}
                  </button>
                ))}
              </div>,
            )}
            {row(
              t("kind"),
              <div className="flex flex-wrap gap-1.5">
                {(["dictation", "gaps"] as const).map((x) => (
                  <button key={x} onClick={() => setKind(x)} className={chip(kind === x)}>
                    {t(`kinds.${x}`)}
                  </button>
                ))}
              </div>,
            )}
            <button onClick={() => setOpen(false)} className="btn btn-primary w-full">
              {t("done")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
