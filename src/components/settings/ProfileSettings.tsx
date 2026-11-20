"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Profile } from "@/lib/profile";

export default function ProfileSettings() {
  const t = useTranslations("settings.profile");
  const [p, setP] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetch("/api/settings/profile").then(async (r) => setP(await r.json()));
  }, []);
  if (!p) return null;

  async function save(next: Profile) {
    setP(next);
    const r = await fetch("/api/settings/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    setSaved(r.ok);
    setTimeout(() => setSaved(false), 1500);
  }
  const sel = "min-h-10 rounded-lg border border-line bg-paper px-2 text-sm";

  return (
    <section>
      <h2 className="font-serif text-xl font-bold">{t("title")}</h2>
      <p className="mb-3 text-sm text-muted">{t("hint")}</p>
      <div className="grid gap-3 rounded-2xl border border-line bg-card p-4 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-2 text-sm">
          {t("level")}
          <select className={sel} value={p.level} onChange={(e) => save({ ...p, level: e.target.value as Profile["level"] })}>
            {["B1", "B2", "C1", "C2"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 text-sm">
          {t("targetBand")}
          <select className={sel} value={p.targetBand} onChange={(e) => save({ ...p, targetBand: Number(e.target.value) })}>
            {[5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 text-sm">
          {t("explainIn")}
          <select className={sel} value={p.explainIn} onChange={(e) => save({ ...p, explainIn: e.target.value as Profile["explainIn"] })}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 text-sm">
          {t("lessonWords")}
          <select className={sel} value={p.lessonWords} onChange={(e) => save({ ...p, lessonWords: Number(e.target.value) })}>
            {[400, 500, 650, 800, 1000].map((n) => (
              <option key={n} value={n}>
                ~{n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {saved && <p className="mt-2 text-sm text-muted">✓</p>}
    </section>
  );
}
