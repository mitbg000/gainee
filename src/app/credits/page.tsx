import { and, desc, eq } from "drizzle-orm";
import { getFormatter, getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import PayPanel from "@/components/admin/PayPanel";
import RedeemCode from "@/components/admin/RedeemCode";
import TopUp from "@/components/admin/TopUp";
import { getDb, schema } from "@/db";
import { creditHistory, getCreditConfig } from "@/lib/credits";
import { fmtCredits } from "@/lib/fmtCredits";
import { getSepay, qrUrl, sepayOn, topupCode } from "@/lib/payments";
import { currentUser } from "@/lib/users";
import * as I from "@/components/icons";

export const dynamic = "force-dynamic";

/** Balance, one top-up flow, requests still waiting for a payment, and what the credits went on. */
export default async function CreditsPage() {
  const t = await getTranslations("credits");
  const f = await getFormatter();
  const me = (await currentUser())!; // Shell sends the logged-out to /login
  const [cfg, logs, waiting, sepay] = await Promise.all([
    getCreditConfig(),
    creditHistory(me.id, 50),
    getDb()
      .select()
      .from(schema.topups)
      .where(and(eq(schema.topups.userId, me.id), eq(schema.topups.status, "pending")))
      .orderBy(desc(schema.topups.id)),
    getSepay(),
  ]);
  const vnd = (n: number) => f.number(n, { style: "currency", currency: "VND", maximumFractionDigits: 0 });
  const admin = me.role === "admin";
  const top = Math.max(0, ...cfg.packages.map((p) => p.price / p.credits)); // dearest rate: what the others save against
  const perToken = (cfg.default.in + cfg.default.out) / 2 / 1e6;
  const rates = Object.entries(cfg.models);
  const canTopUp = cfg.packages.length > 0 || cfg.customEnabled;
  const box = "rounded-2xl border border-line bg-card p-5";

  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>

      {/* balance */}
      <section className={`${box} mt-5 flex flex-wrap items-end gap-x-8 gap-y-2`}>
        <div>
          <p className="text-sm text-muted">{t("balance")}</p>
          {admin ? (
            <p className="mt-1 text-lg font-semibold">{t("adminFree")}</p>
          ) : (
            <p className={`font-serif text-5xl font-bold tabular-nums ${me.credits <= 0 ? "text-red-600 dark:text-red-400" : ""}`}>
              {fmtCredits(me.credits)} <span className="text-lg font-normal text-muted">credit</span>
            </p>
          )}
        </div>
        {!admin && perToken > 0 && <p className="pb-1.5 text-sm text-muted">{t("tokensLeft", { n: f.number(Math.floor(Math.max(0, me.credits) / perToken), { notation: "compact" }) })}</p>}
        <details className="w-full text-xs text-muted">
          <summary className="cursor-pointer select-none">{t("howTitle")}</summary>
          <p className="mt-2">{t("how")}</p>
          <ul className="mt-1 space-y-0.5 tabular-nums">
            {rates.map(([m, p]) => (
              <li key={m}>
                {m}: {t("rate", { in: p.in, out: p.out })}
              </li>
            ))}
            <li>
              {rates.length ? `${t("otherModels")}: ` : ""}
              {t("rate", { in: cfg.default.in, out: cfg.default.out })}
            </li>
            {cfg.image > 0 && <li>{t("imageRate", { n: cfg.image })}</li>}
          </ul>
        </details>
      </section>

      {/* requests still waiting for the transfer */}
      {waiting.map((r) => {
        const pay = sepayOn(sepay) ? { qr: qrUrl(sepay, r.price, topupCode(r.id)), bank: sepay.bank, account: sepay.account, holder: sepay.holder } : null;
        return (
          <details key={r.id} className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
              <I.IconClock className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              <span className="flex-1">{t("waitingLine", { code: topupCode(r.id), credits: fmtCredits(r.credits), price: vnd(r.price) })}</span>
              {pay && <span className="font-semibold text-accent">{t("payContinue")} →</span>}
            </summary>
            {pay ? <PayPanel id={r.id} code={topupCode(r.id)} price={vnd(r.price)} pay={pay} /> : cfg.payInfo && <p className="mt-2 whitespace-pre-line">{cfg.payInfo}</p>}
          </details>
        );
      })}

      {/* top up */}
      {!admin && (
        <section className={`${box} mt-6`}>
          <h2 className="font-serif text-xl font-bold">{t("topup")}</h2>
          <div className="mt-4">
            {canTopUp ? (
              <TopUp
                packages={cfg.packages.map((p) => ({ credits: p.credits, price: p.price, save: top > 0 ? Math.round((1 - p.price / p.credits / top) * 100) : 0 }))}
                custom={cfg.customEnabled ? { min: cfg.customMin, perCredit: cfg.customPerCredit } : null}
                payInfo={cfg.payInfo}
              />
            ) : (
              <p className="text-sm text-muted">{t("noPackages")}</p>
            )}
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <RedeemCode />
          </div>
        </section>
      )}

      {/* history */}
      <h2 className="mt-8 font-serif text-xl font-bold">{t("history")}</h2>
      {logs.length ? (
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
          {logs.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {t(`kind.${l.kind}`)}
                  {l.note ? <span className="text-muted"> · {l.kind === "ai" && t.has(`task.${l.note}`) ? t(`task.${l.note}`) : l.note}</span> : null}
                </span>
                <span className="text-xs text-muted">{f.dateTime(l.createdAt, { dateStyle: "short", timeStyle: "short" })}</span>
              </span>
              <span className={`font-semibold tabular-nums ${l.amount < 0 ? "" : "text-green-700 dark:text-green-400"}`}>
                {l.amount > 0 ? "+" : ""}
                {fmtCredits(l.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{t("noHistory")}</p>
      )}
    </Shell>
  );
}
