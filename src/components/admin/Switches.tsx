"use client";

import { useTranslations } from "next-intl";

/** One row per feature: follow the default (group / role), always on, or always off. */
export default function Switches({ value, onChange, keys, defaults }: { value: Record<string, boolean>; onChange: (v: Record<string, boolean>) => void; keys: readonly string[]; /** what "default" means now, shown beside it */ defaults?: Record<string, boolean> }) {
  const t = useTranslations("admin");
  const set = (k: string, v: string) => {
    const next = { ...value };
    if (v === "") delete next[k];
    else next[k] = v === "on";
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      {keys.map((k) => (
        <label key={k} className="flex items-center justify-between gap-3 text-sm">
          <span>{t(`feature.${k}`)}</span>
          <select value={k in value ? (value[k] ? "on" : "off") : ""} onChange={(e) => set(k, e.target.value)} className="field-sm">
            <option value="">{defaults ? `${t("byDefault")} (${defaults[k] ? t("on") : t("off")})` : t("byDefault")}</option>
            <option value="on">{t("on")}</option>
            <option value="off">{t("off")}</option>
          </select>
        </label>
      ))}
    </div>
  );
}
