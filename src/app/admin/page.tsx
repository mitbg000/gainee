import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getFormatter, getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import PricingEditor from "@/components/admin/PricingEditor";
import TopupActions from "@/components/admin/TopupActions";
import { getDb, schema } from "@/db";
import type { AiRouting } from "@/lib/ai/tasks";
import { getCreditConfig } from "@/lib/credits";
import { fmtCredits } from "@/lib/fmtCredits";
import { getSetting } from "@/lib/settings";
import { requireRole } from "@/lib/users";

export const dynamic = "force-dynamic";

const TABS = ["users", "topups", "pricing", "usage"] as const;
const DAYS = 30;

/** Admin: accounts, top-up requests, credit prices and what the AI was used for. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!(await requireRole("admin"))) notFound();
  const t = await getTranslations("admin");
  const f = await getFormatter();
  const q = (await searchParams).tab;
  const tab = TABS.find((x) => x === q) ?? "users";
  const db = getDb();
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const vnd = (n: number) => f.number(n, { style: "currency", currency: "VND", maximumFractionDigits: 0 });
  const when = (d: Date) => f.dateTime(d, { dateStyle: "short", timeStyle: "short" });
  const [{ pending }] = await db.select({ pending: sql<number>`count(*)` }).from(schema.topups).where(eq(schema.topups.status, "pending"));

  let body: React.ReactNode = null;
  if (tab === "users") {
    const [list, used] = await Promise.all([
      db.select().from(schema.users).orderBy(desc(schema.users.id)),
      db
        .select({ userId: schema.aiCalls.userId, credits: sql<number>`coalesce(sum(${schema.aiCalls.credits}),0)`, calls: sql<number>`count(*)` })
        .from(schema.aiCalls)
        .where(gte(schema.aiCalls.createdAt, since))
        .groupBy(schema.aiCalls.userId),
    ]);
    const use = new Map(used.map((u) => [u.userId, u]));
    body = (
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2">{t("user")}</th>
              <th className="px-2 py-2">{t("role")}</th>
              <th className="px-2 py-2 text-right">{t("credits")}</th>
              <th className="px-2 py-2 text-right">{t("used", { n: DAYS })}</th>
              <th className="px-4 py-2">{t("lastLogin")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((u) => (
              <tr key={u.id} className={u.disabled ? "opacity-50" : ""}>
                <td className="px-4 py-2">
                  <Link href={`/admin/users/${u.id}`} className="font-semibold hover:text-accent">
                    {u.name || u.email}
                  </Link>
                  <div className="text-xs text-muted">
                    {u.email}
                    {u.disabled && ` · ${t("locked")}`}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <span className={`chip ${u.role === "student" ? "" : "chip-on"}`}>{t(`roles.${u.role}`)}</span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{u.role === "admin" ? "∞" : fmtCredits(u.credits)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {fmtCredits(Number(use.get(u.id)?.credits ?? 0))} · {t("calls", { n: Number(use.get(u.id)?.calls ?? 0) })}
                </td>
                <td className="px-4 py-2 text-xs text-muted">{u.lastLoginAt ? when(u.lastLoginAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (tab === "topups") {
    const rows = await db
      .select({ r: schema.topups, email: schema.users.email, name: schema.users.name })
      .from(schema.topups)
      .innerJoin(schema.users, eq(schema.users.id, schema.topups.userId))
      .orderBy(sql`${schema.topups.status} = 'pending' desc`, desc(schema.topups.id))
      .limit(100);
    body = rows.length ? (
      <ul className="divide-y divide-line rounded-2xl border border-line bg-card text-sm">
        {rows.map(({ r, email, name }) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="font-mono text-xs text-muted">GN{r.id}</span>
            <span className="min-w-0 flex-1">
              <Link href={`/admin/users/${r.userId}`} className="font-semibold hover:text-accent">
                {name || email}
              </Link>
              <span className="text-muted">
                {" "}
                · {fmtCredits(r.credits)} credit · {vnd(r.price)} · {when(r.createdAt)}
              </span>
            </span>
            {r.status === "pending" ? <TopupActions id={r.id} /> : <span className={`chip ${r.status === "done" ? "chip-on" : ""}`}>{t(`topupStatus.${r.status}`)}</span>}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-muted">{t("noTopups")}</p>
    );
  } else if (tab === "pricing") {
    const [cfg, routing, seen] = await Promise.all([
      getCreditConfig(),
      getSetting<AiRouting>("ai.routing"),
      db.selectDistinct({ model: schema.aiCalls.model }).from(schema.aiCalls).where(gte(schema.aiCalls.createdAt, since)),
    ]);
    const models = [...new Set([...Object.keys(cfg.models), ...Object.values(routing ?? {}).flatMap((r) => (r ? [r.model, r.fallback?.model ?? ""] : [])), ...seen.map((s) => s.model)])]
      .filter(Boolean)
      .sort();
    body = <PricingEditor initial={cfg} models={models} />;
  } else {
    const [byTask, recent] = await Promise.all([
      db
        .select({ task: schema.aiCalls.task, model: schema.aiCalls.model, calls: sql<number>`count(*)`, pt: sql<number>`coalesce(sum(${schema.aiCalls.promptTokens}),0)`, ct: sql<number>`coalesce(sum(${schema.aiCalls.completionTokens}),0)`, credits: sql<number>`coalesce(sum(${schema.aiCalls.credits}),0)` })
        .from(schema.aiCalls)
        .where(gte(schema.aiCalls.createdAt, since))
        .groupBy(schema.aiCalls.task, schema.aiCalls.model)
        .orderBy(desc(sql`count(*)`)),
      db.select().from(schema.aiCalls).orderBy(desc(schema.aiCalls.id)).limit(50),
    ]);
    const ids = [...new Set(recent.map((r) => r.userId).filter((x): x is number => !!x))];
    const who = new Map(ids.length ? (await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(inArray(schema.users.id, ids))).map((u) => [u.id, u.email]) : []);
    const num = (n: number) => f.number(Number(n));
    body = (
      <>
        <p className="text-sm text-muted">{t("usageHint", { n: DAYS })}</p>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2">{t("task")}</th>
                <th className="px-2 py-2">Model</th>
                <th className="px-2 py-2 text-right">{t("callsCol")}</th>
                <th className="px-2 py-2 text-right">{t("tokens")}</th>
                <th className="px-4 py-2 text-right">{t("credits")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {byTask.map((r) => (
                <tr key={r.task + r.model}>
                  <td className="px-4 py-2">{r.task}</td>
                  <td className="px-2 py-2 text-muted">{r.model}</td>
                  <td className="px-2 py-2 text-right">{num(r.calls)}</td>
                  <td className="px-2 py-2 text-right text-muted">
                    {num(r.pt)} / {num(r.ct)}
                  </td>
                  <td className="px-4 py-2 text-right">{fmtCredits(Number(r.credits))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 className="mt-6 font-semibold">{t("recent")}</h2>
        <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
          {recent.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2">
              <span className="w-28 text-xs text-muted">{when(r.createdAt)}</span>
              <span className="min-w-0 flex-1 truncate">
                {r.task} · <span className="text-muted">{r.model}</span>
                {r.userId && <span className="text-muted"> · {who.get(r.userId) ?? r.userId}</span>}
              </span>
              {!r.ok && <span className="text-xs text-red-600">{t("failedCall")}</span>}
              <span className="tabular-nums">{r.credits != null ? fmtCredits(r.credits) : "—"}</span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <Shell wide>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <nav role="tablist" aria-label={t("title")} className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((x) => (
          <Link key={x} href={`/admin?tab=${x}`} role="tab" aria-selected={tab === x} className="tab" scroll={false}>
            {t(`tabs.${x}`)}
            {x === "topups" && Number(pending) > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[11px] font-bold text-on-accent">{pending}</span>}
          </Link>
        ))}
      </nav>
      <div role="tabpanel" className="mt-6">
        {body}
      </div>
    </Shell>
  );
}
