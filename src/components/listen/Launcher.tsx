"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import * as I from "@/components/icons";

const SIZES = [10, 20, 30];

/** Start a session: today's review, random sentences not shown yet, or both mixed; dictation or gap filling. */
export default function Launcher({ due, sources }: { due: number; sources: { id: number; title: string }[] }) {
  const t = useTranslations("listen.launch");
  const [scope, setScope] = useState("all");
  const [n, setN] = useState(20);
  const [kind, setKind] = useState<"dictation" | "gaps">("dictation");
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("rl_listen_launch") ?? "{}");
      if (s.scope) setScope(s.scope);
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

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap gap-2">
        <Link href={href("review")} className={`btn ${due ? "btn-primary" : "btn-secondary"}`} aria-disabled={!due}>
          <I.IconCards /> {t("review", { n: due })}
        </Link>
        <Link href={href("random")} className="btn btn-secondary">
          <I.IconBolt /> {t("random")}
        </Link>
        <Link href={href("mix")} className="btn btn-secondary">
          <I.IconRefresh /> {t("mix")}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="field field-sm w-auto max-w-full" aria-label={t("scope")}>
          {["all", "youtube", "ielts", "fast", "numbers"].map((s) => (
            <option key={s} value={s}>
              {t(`scopes.${s}`)}
            </option>
          ))}
          {sources.length > 0 && (
            <optgroup label={t("oneSource")}>
              {sources.map((s) => (
                <option key={s.id} value={`src:${s.id}`}>
                  {s.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <select value={n} onChange={(e) => setN(Number(e.target.value))} className="field field-sm w-auto" aria-label={t("size")}>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {t("sentences", { n: s })}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as "dictation" | "gaps")} className="field field-sm w-auto" aria-label={t("kind")}>
          <option value="dictation">{t("kinds.dictation")}</option>
          <option value="gaps">{t("kinds.gaps")}</option>
        </select>
      </div>
      <p className="text-xs text-muted">{t("hint")}</p>
    </div>
  );
}
