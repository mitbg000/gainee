"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const cache = new Map<number, Promise<string[]>>();
/** Model ids of a saved provider, loaded once per page. */
export function modelsOf(providerId: number) {
  if (!cache.has(providerId))
    cache.set(
      providerId,
      fetch(`/api/ai/providers/${providerId}/models`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    );
  return cache.get(providerId)!;
}
export const forgetModels = (providerId: number) => cache.delete(providerId);

/**
 * Pick a model from the provider's list. Only when the provider offers no list (no /models endpoint, wrong key)
 * does it fall back to typing the name.
 */
export default function ModelSelect({
  providerId,
  value,
  onChange,
  filter,
  className = "field",
}: {
  providerId: number;
  value: string;
  onChange: (model: string) => void;
  /** e.g. image models only; ignored when nothing matches */
  filter?: (id: string) => boolean;
  className?: string;
}) {
  const t = useTranslations("settings.routing");
  const [list, setList] = useState<string[] | null>(null);
  const [typed, setTyped] = useState(value);
  useEffect(() => setTyped(value), [value]);
  useEffect(() => {
    let live = true;
    setList(null);
    modelsOf(providerId).then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, [providerId]);

  if (list && list.length === 0)
    return (
      <input
        className={`${className} min-w-0 flex-1`}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onBlur={() => typed.trim() && typed !== value && onChange(typed.trim())}
        placeholder={t("typeModel")}
        aria-label={t("model")}
      />
    );
  const matching = list && filter ? list.filter(filter) : list;
  const options = [...new Set([value, ...(matching?.length ? matching : (list ?? []))])].filter(Boolean);
  return (
    <select className={`${className} min-w-0 flex-1`} value={value} disabled={!list} onChange={(e) => onChange(e.target.value)} aria-label={t("model")}>
      {!value && <option value="">{list ? t("chooseModel") : t("loadingModels")}</option>}
      {options.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}
