"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import type { ProviderPublic } from "@/lib/ai/providers";
import { AI_TASKS, PROVIDER_PRESETS, type AiRouting, type AiTask } from "@/lib/ai/tasks";

type PresetKey = keyof typeof PROVIDER_PRESETS;
type TestResult = { ok: boolean; reply?: string; error?: string; models: string[]; modelsError?: string | null };

const MODEL_HINT: Record<PresetKey, string> = {
  deepseek: "deepseek-chat",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  xai: "grok-3-mini",
  custom: "model-name",
};

const input = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-base";
const btn = "min-h-10 rounded-xl border border-line px-3 text-sm hover:bg-paper";
const btnPrimary = "min-h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-50";

export default function AiSettings() {
  const t = useTranslations("settings");
  const [providers, setProviders] = useState<ProviderPublic[]>([]);
  const [routing, setRouting] = useState<AiRouting>({});
  const [models, setModels] = useState<Record<number, string[]>>({});
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([fetch("/api/ai/providers").then((x) => x.json()), fetch("/api/ai/routing").then((x) => x.json())]);
    setProviders(p);
    setRouting(r);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function saveRouting(next: AiRouting) {
    setRouting(next);
    const r = await fetch("/api/ai/routing", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    setMsg(r.ok ? t("saved") : t("saveError"));
    setTimeout(() => setMsg(""), 2000);
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-serif text-xl font-bold">{t("providers.title")}</h2>
        <p className="mb-3 text-sm text-muted">{t("providers.hint")}</p>
        <div className="space-y-3">
          {providers.map((p) => (
            <ProviderCard key={p.id} p={p} onChange={load} onModels={(m) => setModels((x) => ({ ...x, [p.id]: m }))} />
          ))}
          <AddProvider onAdded={load} />
        </div>
      </section>

      <section>
        <h2 className="font-serif text-xl font-bold">{t("routing.title")}</h2>
        <p className="mb-3 text-sm text-muted">{t("routing.hint")}</p>
        {providers.length === 0 ? (
          <p className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">{t("routing.needProvider")}</p>
        ) : (
          <div className="divide-y divide-line rounded-2xl border border-line bg-card">
            {AI_TASKS.map((task) => (
              <TaskRoute
                key={task}
                task={task}
                providers={providers}
                models={models}
                value={routing[task]}
                onChange={(v) => saveRouting({ ...routing, [task]: v ?? undefined })}
              />
            ))}
          </div>
        )}
        {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
      </section>
    </div>
  );
}

function ProviderCard({ p, onChange, onModels }: { p: ProviderPublic; onChange: () => void; onModels: (m: string[]) => void }) {
  const t = useTranslations("settings.providers");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [model, setModel] = useState(p.defaultModel);
  const [key, setKey] = useState("");

  async function test() {
    setTesting(true);
    setResult(null);
    const r: TestResult = await fetch(`/api/ai/providers/${p.id}/test`, { method: "POST" }).then((x) => x.json());
    setTesting(false);
    setResult(r);
    if (r.models?.length) onModels(r.models);
  }
  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/ai/providers/${p.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    onChange();
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{p.label}</span>
        <span className="rounded bg-paper px-1.5 text-xs text-muted">{p.name}</span>
        <span className="text-sm text-muted">
          {p.defaultModel} · {p.keyPreview}
        </span>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          {t("enabled")}
        </label>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">{p.baseUrl}</p>

      {editing && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className={input} value={model} onChange={(e) => setModel(e.target.value)} placeholder={t("model")} list={`models-${p.id}`} />
          <input className={input} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={t("newKey")} autoComplete="off" />
          <datalist id={`models-${p.id}`}>{result?.models.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btn} onClick={test} disabled={testing}>
          {testing ? t("testing") : t("test")}
        </button>
        {editing ? (
          <>
            <button
              className={btnPrimary}
              onClick={async () => {
                await patch({ defaultModel: model, ...(key ? { apiKey: key } : {}) });
                setEditing(false);
                setKey("");
              }}
            >
              {t("save")}
            </button>
            <button className={btn} onClick={() => setEditing(false)}>
              {t("cancel")}
            </button>
          </>
        ) : (
          <button className={btn} onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
        )}
        <button
          className={`${btn} text-red-600 dark:text-red-400`}
          onClick={async () => {
            if (!confirm(t("confirmDelete", { name: p.label }))) return;
            await fetch(`/api/ai/providers/${p.id}`, { method: "DELETE" });
            onChange();
          }}
        >
          {t("delete")}
        </button>
      </div>

      {result && (
        <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${result.ok ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300"}`}>
          {result.ok ? t("testOk", { reply: result.reply ?? "" }) : t("testFail", { error: result.error ?? "" })}
          {result.models.length > 0 && <div className="mt-1 text-xs opacity-80">{t("modelsFound", { n: result.models.length })}</div>}
        </div>
      )}
    </div>
  );
}

function AddProvider({ onAdded }: { onAdded: () => void }) {
  const t = useTranslations("settings.providers");
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<PresetKey>("deepseek");
  const [label, setLabel] = useState<string>(PROVIDER_PRESETS.deepseek.label);
  const [baseUrl, setBaseUrl] = useState<string>(PROVIDER_PRESETS.deepseek.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState("");

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="min-h-11 w-full rounded-2xl border border-dashed border-accent text-sm font-medium text-accent">
        + {t("add")}
      </button>
    );

  return (
    <form
      className="space-y-3 rounded-2xl border border-line bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        const r = await fetch("/api/ai/providers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: preset, label, baseUrl, apiKey, defaultModel: model || MODEL_HINT[preset] }),
        });
        if (!r.ok) return setError(t("invalid"));
        setOpen(false);
        setApiKey("");
        onAdded();
      }}
    >
      <div className="flex flex-wrap gap-2">
        {(Object.keys(PROVIDER_PRESETS) as PresetKey[]).map((k) => (
          <button
            type="button"
            key={k}
            onClick={() => {
              setPreset(k);
              setLabel(PROVIDER_PRESETS[k].label);
              setBaseUrl(PROVIDER_PRESETS[k].baseUrl);
            }}
            className={`min-h-9 rounded-full border px-3 text-sm ${preset === k ? "border-accent bg-accent text-on-accent" : "border-line"}`}
          >
            {PROVIDER_PRESETS[k].label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-muted">{t("label")}</span>
          <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} required />
        </label>
        <label className="text-sm">
          <span className="text-muted">{t("model")}</span>
          <input className={input} value={model} onChange={(e) => setModel(e.target.value)} placeholder={`${t("eg")} ${MODEL_HINT[preset]}`} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-muted">{t("apiKey")}</span>
          <input className={input} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required minLength={8} autoComplete="off" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-muted">{t("baseUrl")}</span>
          <input className={input} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required type="url" />
        </label>
      </div>
      <p className="text-xs text-muted">{t("modelNote")}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className={btnPrimary}>{t("save")}</button>
        <button type="button" className={btn} onClick={() => setOpen(false)}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

function TaskRoute({
  task,
  providers,
  models,
  value,
  onChange,
}: {
  task: AiTask;
  providers: ProviderPublic[];
  models: Record<number, string[]>;
  value: AiRouting[AiTask];
  onChange: (v: AiRouting[AiTask] | null) => void;
}) {
  const t = useTranslations("settings.routing");
  const [model, setModel] = useState(value?.model ?? "");
  const [fbModel, setFbModel] = useState(value?.fallback?.model ?? "");
  useEffect(() => {
    setModel(value?.model ?? "");
    setFbModel(value?.fallback?.model ?? "");
  }, [value]);

  const providerOf = (id?: number) => providers.find((p) => p.id === id);
  const pick = (id: number) => {
    const p = providerOf(id);
    if (p) onChange({ ...(value ?? {}), providerId: id, model: p.defaultModel });
  };

  return (
    <div className="grid gap-2 p-4 md:grid-cols-[1fr_2fr]">
      <div>
        <div className="font-medium">{t(`tasks.${task}.title`)}</div>
        <div className="text-xs text-muted">{t(`tasks.${task}.hint`)}</div>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <select className="min-h-10 rounded-lg border border-line bg-paper px-2 text-sm" value={value?.providerId ?? ""} onChange={(e) => (e.target.value ? pick(Number(e.target.value)) : onChange(null))}>
            <option value="">{t("auto")}</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {value && (
            <input
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-sm"
              value={model}
              list={`task-models-${task}`}
              onChange={(e) => setModel(e.target.value)}
              onBlur={() => model && model !== value.model && onChange({ ...value, model })}
              aria-label={t("model")}
            />
          )}
          <datalist id={`task-models-${task}`}>{(models[value?.providerId ?? 0] ?? []).map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        {value && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{t("fallback")}</span>
            <select
              className="min-h-9 rounded-lg border border-line bg-paper px-2 text-sm"
              value={value.fallback?.providerId ?? ""}
              onChange={(e) => {
                const p = providerOf(Number(e.target.value));
                onChange({ ...value, fallback: p ? { providerId: p.id, model: p.defaultModel } : undefined });
              }}
            >
              <option value="">{t("none")}</option>
              {providers
                .filter((p) => p.id !== value.providerId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
            </select>
            {value.fallback && (
              <input
                className="min-h-9 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-sm"
                value={fbModel}
                onChange={(e) => setFbModel(e.target.value)}
                onBlur={() => fbModel && onChange({ ...value, fallback: { ...value.fallback!, model: fbModel } })}
                aria-label={t("model")}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
