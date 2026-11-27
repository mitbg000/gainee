import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getFormatter, getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import Avatar from "@/components/Avatar";
import AiSettings from "@/components/settings/AiSettings";
import CouponEditor from "@/components/admin/CouponEditor";
import GroupEditor from "@/components/admin/GroupEditor";
import SecurityEditor from "@/components/admin/SecurityEditor";
import PaymentSettings from "@/components/admin/PaymentSettings";
import PricingEditor from "@/components/admin/PricingEditor";
import TopupActions from "@/components/admin/TopupActions";
import { getDb, schema } from "@/db";
import type { AiRouting } from "@/lib/ai/tasks";
import { getCreditConfig } from "@/lib/credits";
import { imageUrl } from "@/lib/images";
import { getSepay, topupCode } from "@/lib/payments";
import { captchaOn, getSecurity, mailOn } from "@/lib/security";
import { fmtCredits } from "@/lib/fmtCredits";
import { getSetting } from "@/lib/settings";
import { FEATURES, requireRole } from "@/lib/users";

export const dynamic = "force-dynamic";

const TABS = ["users", "groups", "topups", "coupons", "pricing", "ai", "usage", "security"] as const;
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
                  <div className="flex items-center gap-3">
                    <Avatar url={u.avatar ? imageUrl(u.avatar) : null} name={u.name || u.email} className="size-8 text-sm" />
                    <div className="min-w-0">
                      <Link href={`/admin/users/${u.id}`} className="font-semibold hover:text-accent">
                        {u.name || u.email}
                      </Link>
                      <div className="text-xs text-muted">
                        {u.email}
                        {u.disabled && ` · ${t("locked")}`}
                      </div>
                    </div>
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
  } else if (tab === "groups") {
    const [gs, links, us] = await Promise.all([
      db.select().from(schema.groups).orderBy(schema.groups.name),
      db.select().from(schema.userGroups),
      db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name }).from(schema.users).orderBy(schema.users.email),
    ]);
    body = (
      <GroupEditor
        groups={gs.map((g) => ({ id: g.id, name: g.name, features: g.features, members: links.filter((l) => l.groupId === g.id).map((l) => l.userId) }))}
        users={us.map((u) => ({ id: u.id, label: u.name ? `${u.name} · ${u.email}` : u.email }))}
        features={FEATURES}
      />
    );
  } else if (tab === "ai") {
    body = <AiSettings />; // providers, a model per task, AI pictures
  } else if (tab === "coupons") {
    const rows = await db.select().from(schema.coupons).orderBy(desc(schema.coupons.id)).limit(500);
    body = <CouponEditor rows={rows.map((r) => ({ ...r, expiresAt: r.expiresAt?.toISOString() ?? null }))} />;
  } else if (tab === "security") {
    const [sec, cfg, logs, [{ failed24 }], [{ admins }], [{ providers }]] = await Promise.all([
      getSecurity(),
      getCreditConfig(),
      db.select().from(schema.loginLogs).orderBy(desc(schema.loginLogs.id)).limit(100),
      db.select({ failed24: sql<number>`count(*)` }).from(schema.loginLogs).where(and(eq(schema.loginLogs.ok, false), gte(schema.loginLogs.createdAt, new Date(Date.now() - 86_400_000)))),
      db.select({ admins: sql<number>`count(*)` }).from(schema.users).where(and(eq(schema.users.role, "admin"), eq(schema.users.disabled, false))),
      db.select({ providers: sql<number>`count(*)` }).from(schema.aiProviders).where(eq(schema.aiProviders.enabled, true)),
    ]);
    const secret = process.env.SESSION_SECRET ?? "";
    let encOk = false;
    try {
      encOk = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64").length === 32;
    } catch {}
    // ok = green, warn = amber, bad = red
    const checks: { key: string; level: "ok" | "warn" | "bad"; values?: Record<string, string | number> }[] = [
      { key: "sessionSecret", level: secret.length >= 32 && !/change|example|secret/i.test(secret) ? "ok" : "bad" },
      { key: "encryptionKey", level: encOk ? "ok" : "bad" },
      { key: "cookieSecure", level: process.env.COOKIE_SECURE === "0" ? "bad" : process.env.NODE_ENV === "production" ? "ok" : "warn" },
      { key: "keysHidden", level: "ok" },
      { key: "admins", level: Number(admins) === 1 ? "ok" : "warn", values: { n: Number(admins) } },
      { key: "signupCaptcha", level: !cfg.allowSignup || captchaOn(sec) ? "ok" : cfg.signupBonus > 0 ? "bad" : "warn" },
      { key: "aiRate", level: sec.aiPerMinute > 0 ? "ok" : "warn" },
      { key: "aiDaily", level: sec.aiCreditsPerDay > 0 ? "ok" : "warn" },
      { key: "aiSize", level: sec.maxInputChars > 0 && sec.maxOutputTokens > 0 ? "ok" : "warn" },
      { key: "providers", level: Number(providers) > 0 ? "ok" : "warn", values: { n: Number(providers) } },
      { key: "mail", level: mailOn(sec) ? "ok" : "warn" },
      { key: "failedLogins", level: Number(failed24) > 50 ? "bad" : Number(failed24) > 10 ? "warn" : "ok", values: { n: Number(failed24) } },
    ];
    const dot = { ok: "bg-green-500", warn: "bg-amber-500", bad: "bg-red-500" };
    body = (
      <div className="space-y-6">
        <section>
          <h2 className="font-serif text-xl font-bold">{t("security.checksTitle")}</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
            {checks.map((c) => (
              <li key={c.key} className="flex items-start gap-3 px-4 py-2.5">
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dot[c.level]}`} aria-label={c.level} />
                <span>
                  <span className="font-medium">{t(`security.check.${c.key}.title`, c.values ?? {})}</span>
                  {c.level !== "ok" && <span className="block text-xs text-muted">{t(`security.check.${c.key}.fix`)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <SecurityEditor
          initial={(({ turnstileSecretEnc: _a, smtpPassEnc: _b, ...rest }) => (void _a, void _b, rest))(sec)}
          hasSecret={!!sec.turnstileSecretEnc}
          hasSmtpPass={!!sec.smtpPassEnc}
        />
        <section>
          <h2 className="font-serif text-xl font-bold">{t("security.loginsTitle")}</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2">
                <span className="w-28 text-xs text-muted">{when(l.createdAt)}</span>
                <span className={`size-2 rounded-full ${l.ok ? "bg-green-500" : "bg-red-500"}`} />
                <span className="min-w-0 flex-1 truncate">
                  {l.userId ? <Link href={`/admin/users/${l.userId}`} className="hover:text-accent">{l.login || "—"}</Link> : l.login || "—"}
                  {!l.ok && l.reason && <span className="text-muted"> · {t(`security.reason.${l.reason}`)}</span>}
                </span>
                <span className="font-mono text-xs text-muted">{l.ip}</span>
              </li>
            ))}
            {!logs.length && <li className="px-4 py-3 text-muted">—</li>}
          </ul>
        </section>
      </div>
    );
  } else if (tab === "topups") {
    const rows = await db
      .select({ r: schema.topups, email: schema.users.email, name: schema.users.name })
      .from(schema.topups)
      .innerJoin(schema.users, eq(schema.users.id, schema.topups.userId))
      .orderBy(sql`${schema.topups.status} = 'pending' desc`, desc(schema.topups.id))
      .limit(100);
    // transfers SePay reported that did not pay a request by themselves: settle them by hand
    const odd = await db.select().from(schema.payments).where(sql`${schema.payments.status} <> 'paid'`).orderBy(desc(schema.payments.createdAt)).limit(30);
    const oddList = odd.length > 0 && (
      <section className="mb-6">
        <h2 className="font-semibold">{t("payments.oddTitle")}</h2>
        <p className="text-xs text-muted">{t("payments.oddHint")}</p>
        <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
          {odd.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="w-28 text-xs text-muted">{when(p.createdAt)}</span>
              <span className="font-semibold tabular-nums">{vnd(p.amount)}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{p.content}</span>
              {p.topupId && <span className="font-mono text-xs">{topupCode(p.topupId)}</span>}
              <span className="chip">{t(`payments.status.${p.status}`)}</span>
            </li>
          ))}
        </ul>
      </section>
    );
    body = rows.length ? (
      <>
      {oddList}
      <ul className="divide-y divide-line rounded-2xl border border-line bg-card text-sm">
        {rows.map(({ r, email, name }) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="font-mono text-xs text-muted">{topupCode(r.id)}</span>
            <span className="min-w-0 flex-1">
              <Link href={`/admin/users/${r.userId}`} className="font-semibold hover:text-accent">
                {name || email}
              </Link>
              <span className="text-muted">
                {" "}
                · {fmtCredits(r.credits)} credit · {vnd(r.price)} · {when(r.createdAt)}
              </span>
            </span>
            {r.status === "pending" ? <TopupActions id={r.id} code={topupCode(r.id)} /> : <span className={`chip ${r.status === "done" ? "chip-on" : ""}`}>{t(`topupStatus.${r.status}`)}</span>}
          </li>
        ))}
      </ul>
      </>
    ) : (
      oddList || <p className="text-sm text-muted">{t("noTopups")}</p>
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
    const [sepay, sec] = await Promise.all([getSepay(), getSecurity()]);
    body = (
      <div className="space-y-6">
        <PaymentSettings
          initial={{ enabled: sepay.enabled, bank: sepay.bank, account: sepay.account, holder: sepay.holder }}
          hasApiKey={!!sepay.apiKeyEnc}
          hasHmac={!!sepay.hmacEnc}
          webhookUrl={`${sec.siteUrl || "https://<site>"}/api/payments/sepay`}
        />
        <PricingEditor initial={cfg} models={models} />
      </div>
    );
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
