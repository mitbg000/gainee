import { desc, eq } from "drizzle-orm";
import { getFormatter, getTranslations } from "next-intl/server";
import Shell from "@/components/Shell";
import BuyPackage from "@/components/admin/BuyPackage";
import PayPanel from "@/components/admin/PayPanel";
import RedeemCode from "@/components/admin/RedeemCode";
import { fmtCredits } from "@/lib/fmtCredits";
import { getDb, schema } from "@/db";
import { creditHistory, getCreditConfig } from "@/lib/credits";
import { getSepay, qrUrl, sepayOn, topupCode } from "@/lib/payments";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/** The learner's balance, top-up packages, their requests and what the credits went on. */
export default async function CreditsPage() {
  const t = await getTranslations("credits");
  const f = await getFormatter();
  const me = (await currentUser())!; // Shell sends the logged-out to /login
  const [cfg, logs, mine] = await Promise.all([
    getCreditConfig(),
    creditHistory(me.id, 100),
    getDb().select().from(schema.topups).where(eq(schema.topups.userId, me.id)).orderBy(desc(schema.topups.id)).limit(20),
  ]);
  const sepay = await getSepay();
  const payOf = (id: number, price: number) => (sepayOn(sepay) ? { qr: qrUrl(sepay, price, topupCode(id)), bank: sepay.bank, account: sepay.account, holder: sepay.holder } : null);
  const vnd = (n: number) => f.number(n, { style: "currency", currency: "VND", maximumFractionDigits: 0 });
  const rates = Object.entries(cfg.models);

  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold md:text-4xl">{t("title")}</h1>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="rounded-2xl border border-line bg-card p-5">
          <p className="text-sm text-muted">{t("balance")}</p>
          {me.role === "admin" ? <p className="mt-1 text-lg font-semibold">{t("adminFree")}</p> : <p className={`mt-1 font-serif text-4xl font-bold tabular-nums ${me.credits <= 0 ? "text-red-600 dark:text-red-400" : ""}`}>{fmtCredits(me.credits)}</p>}
          <p className="mt-3 text-xs text-muted">{t("how")}</p>
          {(rates.length > 0 || cfg.default.in + cfg.default.out > 0) && (
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer">{t("rates")}</summary>
              <ul className="mt-1 space-y-0.5 tabular-nums">
                {rates.map(([m, p]) => (
                  <li key={m}>
                    {m}: {t("rate", { in: p.in, out: p.out })}
                  </li>
                ))}
                <li>
                  {t("otherModels")}: {t("rate", { in: cfg.default.in, out: cfg.default.out })}
                </li>
                {cfg.image > 0 && <li>{t("imageRate", { n: cfg.image })}</li>}
              </ul>
            </details>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-card p-5">
          <p className="font-semibold">{t("topup")}</p>
          {cfg.packages.length || cfg.customEnabled ? (
            <BuyPackage
              packages={(() => {
                // bigger packs are usually cheaper per credit: show how much each saves against the dearest rate
                const top = Math.max(...cfg.packages.map((p) => p.price / p.credits));
                return cfg.packages.map((p) => ({ credits: p.credits, price: vnd(p.price), perCredit: vnd(p.price / p.credits), save: top > 0 ? Math.round((1 - p.price / p.credits / top) * 100) : 0 }));
              })()}
              payInfo={cfg.payInfo}
              custom={cfg.customEnabled ? { min: cfg.customMin, perCredit: cfg.customPerCredit } : null}
            />
          ) : (
            <p className="mt-2 text-sm text-muted">{t("noPackages")}</p>
          )}
          <RedeemCode />
          {mine.length > 0 && (
            <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
              {mine.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-mono text-xs text-muted">{topupCode(r.id)}</span>
                  <span className="flex-1">
                    {t("packLine", { n: fmtCredits(r.credits) })} · {vnd(r.price)}
                    {r.discount > 0 && <span className="text-xs text-green-700 dark:text-green-400"> ({t("saved", { n: vnd(r.discount) })})</span>}
                  </span>
                  <span className={`chip ${r.status === "done" ? "chip-on" : ""}`}>{t(`status.${r.status}`)}</span>
                {r.status === "pending" && payOf(r.id, r.price) && (
                    <details className="w-full">
                      <summary className="cursor-pointer text-xs text-accent">{t("pay.open")}</summary>
                      <PayPanel id={r.id} code={topupCode(r.id)} price={vnd(r.price)} pay={payOf(r.id, r.price)!} />
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h2 className="mt-8 font-serif text-xl font-bold">{t("history")}</h2>
      {logs.length ? (
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
          {logs.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-2">
              <span className="w-32 shrink-0 text-xs text-muted">{f.dateTime(l.createdAt, { dateStyle: "short", timeStyle: "short" })}</span>
              <span className="min-w-0 flex-1 truncate">
                {t(`kind.${l.kind}`)}
                {l.note ? ` · ${l.kind === "ai" ? t.has(`task.${l.note}`) ? t(`task.${l.note}`) : l.note : l.note}` : ""}
              </span>
              <span className={`tabular-nums font-semibold ${l.amount < 0 ? "" : "text-green-700 dark:text-green-400"}`}>
                {l.amount > 0 ? "+" : ""}
                {fmtCredits(l.amount)}
              </span>
              <span className="w-20 text-right text-xs tabular-nums text-muted">{fmtCredits(l.balance)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{t("noHistory")}</p>
      )}
    </Shell>
  );
}
