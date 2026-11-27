import Link from "next/link";
import { notFound } from "next/navigation";
import { count, desc, eq, sum } from "drizzle-orm";
import { getFormatter, getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import UserEditor from "@/components/admin/UserEditor";
import { getDb, schema } from "@/db";
import { creditHistory } from "@/lib/credits";
import { fmtCredits } from "@/lib/fmtCredits";
import { streak } from "@/lib/stats";
import { canUse, FEATURES, getUser, groupSwitches, requireRole } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("admin");
  if (!me) notFound();
  const u = await getUser(Number((await params).id));
  if (!u) notFound();
  const t = await getTranslations("admin");
  const f = await getFormatter();
  const db = getDb();
  const [logs, calls, groups, mine, sw, docs, [wordCount], [xp], days] = await Promise.all([
    creditHistory(u.id, 50),
    db.select().from(schema.aiCalls).where(eq(schema.aiCalls.userId, u.id)).orderBy(desc(schema.aiCalls.id)).limit(30),
    db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).orderBy(schema.groups.name),
    db.select({ id: schema.userGroups.groupId }).from(schema.userGroups).where(eq(schema.userGroups.userId, u.id)),
    groupSwitches(u.id),
    db.select({ id: schema.documents.id, title: schema.documents.title, words: schema.documents.wordCount, createdAt: schema.documents.createdAt }).from(schema.documents).where(eq(schema.documents.userId, u.id)).orderBy(desc(schema.documents.id)),
    db.select({ n: count() }).from(schema.words).where(eq(schema.words.userId, u.id)),
    db.select({ n: sum(schema.activity.xp) }).from(schema.activity).where(eq(schema.activity.userId, u.id)),
    streak(u.id),
  ]);
  const when = (d: Date) => f.dateTime(d, { dateStyle: "short", timeStyle: "short" });

  return (
    <Shell>
      <Link href="/admin" className="text-sm text-muted hover:text-ink">
        ← {t("title")}
      </Link>
      <h1 className="mt-2 font-serif text-3xl font-bold">{u.name || u.email}</h1>
      <p className="text-sm text-muted">
        {u.email} · {t("joined", { date: when(u.createdAt) })}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [t("learner.docs"), docs.length],
          [t("learner.words"), wordCount.n],
          [t("learner.xp"), Number(xp.n ?? 0)],
          [t("learner.streak"), t("learner.days", { n: days })],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-card p-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">{typeof value === "number" ? f.number(value) : value}</p>
          </div>
        ))}
      </div>
      <UserEditor
        user={{ id: u.id, email: u.email, name: u.name ?? "", role: u.role, disabled: u.disabled, credits: u.credits, features: u.features ?? null }}
        defaults={Object.fromEntries(FEATURES.map((x) => [x, canUse({ ...u, features: null }, x, sw)]))}
        features={FEATURES}
        groups={groups}
        groupIds={mine.map((g) => g.id)}
        self={u.id === me.id}
      />

      <section className="mt-8">
        <h2 className="font-serif text-xl font-bold">{t("learner.docList", { n: docs.length })}</h2>
        <ul className="mt-2 max-h-96 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-card text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2">
              <span className="w-28 shrink-0 text-xs text-muted">{when(d.createdAt)}</span>
              <span className="min-w-0 flex-1 truncate">{d.title}</span>
              <span className="tabular-nums text-muted">{t("learner.docWords", { n: d.words })}</span>
            </li>
          ))}
          {!docs.length && <li className="px-4 py-3 text-muted">—</li>}
        </ul>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="font-serif text-xl font-bold">{t("creditLog")}</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2">
                <span className="w-28 shrink-0 text-xs text-muted">{when(l.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {l.kind}
                  {l.note && <span className="text-muted"> · {l.note}</span>}
                </span>
                <span className="tabular-nums">
                  {l.amount > 0 ? "+" : ""}
                  {fmtCredits(l.amount)}
                </span>
              </li>
            ))}
            {!logs.length && <li className="px-4 py-3 text-muted">—</li>}
          </ul>
        </section>
        <section>
          <h2 className="font-serif text-xl font-bold">{t("aiCalls")}</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
            {calls.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2">
                <span className="w-28 shrink-0 text-xs text-muted">{when(c.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {c.task} <span className="text-muted">· {c.model}</span>
                </span>
                {!c.ok && <span className="text-xs text-red-600">{t("failedCall")}</span>}
                <span className="tabular-nums text-muted">{c.credits != null ? fmtCredits(c.credits) : "—"}</span>
              </li>
            ))}
            {!calls.length && <li className="px-4 py-3 text-muted">—</li>}
          </ul>
        </section>
      </div>
    </Shell>
  );
}
