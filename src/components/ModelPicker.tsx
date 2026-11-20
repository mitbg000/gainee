"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export type ModelChoice = { providerId: number; model: string } | null;
type Provider = { id: number; label: string; defaultModel: string; enabled: boolean };

const KEY = "rl_chat_model";
export function loadModelChoice(): ModelChoice {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

/** Provider + model for the assistant; "" = the route configured in Settings. The full model list loads on first open. */
export default function ModelPicker({ value, onChange, className = "" }: { value: ModelChoice; onChange: (v: ModelChoice) => void; className?: string }) {
  const t = useTranslations("assistant");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Record<number, string[]>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/ai/providers")
      .then((r) => r.json())
      .then((p: Provider[]) => setProviders(p.filter((x) => x.enabled)))
      .catch(() => {});
  }, []);
  function loadModels() {
    if (loaded) return;
    setLoaded(true);
    for (const p of providers)
      fetch(`/api/ai/providers/${p.id}/models`)
        .then((r) => r.json())
        .then((ids: string[]) => setModels((m) => ({ ...m, [p.id]: ids })))
        .catch(() => {});
  }

  const cur = value ? `${value.providerId}|${value.model}` : "";
  return (
    <select
      value={cur}
      onFocus={loadModels}
      onPointerDown={loadModels}
      onChange={(e) => {
        const [pid, ...rest] = e.target.value.split("|");
        const v = e.target.value ? { providerId: Number(pid), model: rest.join("|") } : null;
        try {
          localStorage.setItem(KEY, JSON.stringify(v));
        } catch {}
        onChange(v);
      }}
      aria-label={t("model")}
      className={`min-h-9 max-w-[16rem] truncate rounded-lg border border-line bg-card px-2 text-sm ${className}`}
    >
      <option value="">{t("modelDefault")}</option>
      {providers.map((p) => {
        const ids = [...new Set([p.defaultModel, ...(models[p.id] ?? []), ...(value?.providerId === p.id ? [value.model] : [])])];
        return (
          <optgroup key={p.id} label={p.label}>
            {ids.map((m) => (
              <option key={m} value={`${p.id}|${m}`}>
                {m}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
