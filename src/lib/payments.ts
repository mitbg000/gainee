/**
 * SePay bank transfers: the learner pays a top-up request by bank transfer (VietQR) with its code in the transfer
 * content; SePay calls our webhook for every incoming transfer and the matching request gets its credits.
 * Docs: developer.sepay.vn → SePay Webhooks (payload, API Key / HMAC-SHA256, answer {"success": true}).
 */
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { addCredits } from "@/lib/credits";
import { decrypt, encrypt } from "@/lib/crypto";
import { getSetting, setSetting } from "@/lib/settings";

/**
 * A request's code: the admin's prefix + 6 digits (NAP000123). The same prefix goes in SePay → Cấu trúc mã thanh toán
 * (digits, 6–8 long).
 */
export const DEFAULT_PREFIX = "GN";
export const topupCode = (id: number, prefix: string) => `${prefix}${String(id).padStart(6, "0")}`;
const codeRe = (prefix: string) => new RegExp(`${prefix}\\s?(\\d{6,8})`, "i");

export const SepayConfig = z.object({
  enabled: z.boolean().default(false),
  prefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,5}$/)
    .transform((s) => s.toUpperCase())
    .default(DEFAULT_PREFIX),
  bank: z.string().trim().max(50).default(""), // VietQR bank code, e.g. MBBank, VCB, 970422
  account: z.string().trim().max(40).regex(/^[A-Za-z0-9]*$/).default(""),
  holder: z.string().trim().max(100).default(""),
  apiKeyEnc: z.string().max(1000).default(""),
  hmacEnc: z.string().max(1000).default(""),
});
export type SepayConfig = z.infer<typeof SepayConfig>;

export const getSepay = async () => SepayConfig.parse((await getSetting("payments.sepay")) ?? {});

/** Save; a new secret replaces the stored one, an empty one keeps it, null removes it. */
export async function setSepay(c: Omit<SepayConfig, "apiKeyEnc" | "hmacEnc">, secrets: { apiKey?: string | null; hmac?: string | null }) {
  const cur = await getSepay();
  const keep = (v: string | null | undefined, old: string) => (v === null ? "" : v ? encrypt(v) : old);
  await setSetting("payments.sepay", { ...c, apiKeyEnc: keep(secrets.apiKey, cur.apiKeyEnc), hmacEnc: keep(secrets.hmac, cur.hmacEnc) });
}

/** Ready to take payments: switched on, bank account and a webhook secret set. */
export const sepayOn = (c: SepayConfig) => c.enabled && !!c.bank && !!c.account && (!!c.apiKeyEnc || !!c.hmacEnc);

/** VietQR picture with the amount and the code filled in (vietqr.app, as in SePay's docs). */
export const qrUrl = (c: SepayConfig, amount: number, code: string) =>
  `https://vietqr.app/img?${new URLSearchParams({ acc: c.account, bank: c.bank, amount: String(amount), des: code, template: "compact" })}`;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * Is this call really from SePay? Accepted when it matches ANY secret saved here: the HMAC-SHA256 signature over
 * "timestamp.body" (≤ 5 minutes old) or the API key ("Authorization: Apikey …"). Returns null when accepted, else why
 * not (logged, never the secrets themselves).
 */
export function verifySepay(c: SepayConfig, headers: Headers, rawBody: string, now = Date.now()): string | null {
  if (!c.hmacEnc && !c.apiKeyEnc) return "no_secret_saved";
  const sig = headers.get("x-sepay-signature")?.trim().toLowerCase();
  const auth = headers.get("authorization")?.trim();
  if (!sig && !auth) return "no_auth_header";
  const why: string[] = [];
  if (sig) {
    if (!c.hmacEnc) why.push("hmac_header_but_no_hmac_secret");
    else {
      let ts = Number(headers.get("x-sepay-timestamp"));
      if (ts > 1e12) ts = Math.floor(ts / 1000); // milliseconds
      if (!Number.isFinite(ts) || !ts || Math.abs(now / 1000 - ts) > 300) why.push("hmac_bad_timestamp");
      else {
        const hex = crypto.createHmac("sha256", decrypt(c.hmacEnc)).update(`${ts}.${rawBody}`).digest("hex");
        if (same(sig.replace(/^sha256=/, ""), hex)) return null;
        why.push("hmac_mismatch");
      }
    }
  }
  if (auth) {
    const key = auth.match(/^apikey\s+(.+)$/i)?.[1]?.trim();
    if (!key) why.push("authorization_not_apikey");
    else if (!c.apiKeyEnc) why.push("apikey_header_but_no_key_saved");
    else if (same(key, decrypt(c.apiKeyEnc).trim())) return null;
    else why.push("apikey_mismatch");
  }
  return why.join(",");
}

export const Webhook = z.object({
  id: z.coerce.number().int().positive(),
  transferType: z.string(),
  transferAmount: z.coerce.number().int().min(0),
  content: z.string().max(2000).default(""),
  code: z.string().max(100).nullable().optional(),
  description: z.string().max(2000).optional().nullable(),
});

/**
 * One transfer from SePay. Credits are added once: the payment id is the primary key (resent webhooks change nothing)
 * and the request moves from pending to done in one conditional update.
 */
export async function takePayment(p: z.infer<typeof Webhook>, raw: Record<string, unknown>, prefix: string) {
  if (p.transferType !== "in") return "ignored";
  const db = getDb();
  const text = `${p.code ?? ""} ${p.content} ${p.description ?? ""}`;
  const m = codeRe(prefix).exec(text);
  const topupId = m ? Number(m[1]) : null;
  const [t] = topupId ? await db.select().from(schema.topups).where(eq(schema.topups.id, topupId)) : [];
  const status = !t ? "unmatched" : t.status !== "pending" ? "settled" : p.transferAmount < t.price ? "underpaid" : "paid";
  try {
    await db.insert(schema.payments).values({ id: p.id, topupId: t?.id ?? null, amount: p.transferAmount, content: p.content.slice(0, 500), status, raw });
  } catch {
    return "duplicate"; // seen before
  }
  if (status !== "paid" || !t) return status;
  const res = await db
    .update(schema.topups)
    .set({ status: "done", doneAt: new Date(), note: `SePay #${p.id}` })
    .where(and(eq(schema.topups.id, t.id), eq(schema.topups.status, "pending")));
  if ((res as unknown as [{ affectedRows: number }])[0].affectedRows === 1) await addCredits(t.userId, t.credits, "topup", `${topupCode(t.id, prefix)} · SePay`);
  return status;
}
