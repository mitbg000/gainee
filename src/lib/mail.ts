/** E-mail through the admin's SMTP server (nodemailer). */
import nodemailer from "nodemailer";
import { decrypt } from "@/lib/crypto";
import { getSecurity, mailOn } from "@/lib/security";

export async function sendMail(to: string, subject: string, text: string, html: string) {
  const c = await getSecurity();
  if (!mailOn(c)) throw new Error("mail_not_configured");
  const t = nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpSecure,
    auth: c.smtpUser ? { user: c.smtpUser, pass: c.smtpPassEnc ? decrypt(c.smtpPassEnc) : "" } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  await t.sendMail({ from: c.mailFrom, to, subject, text, html });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** A plain, readable e-mail: a title, a few lines and one button. */
export function simpleMail(title: string, lines: string[], button: { label: string; url: string }, foot: string) {
  const text = [title, "", ...lines, "", `${button.label}: ${button.url}`, "", foot].join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2a2f3a">
<h1 style="font-size:22px;margin:0 0 16px">${esc(title)}</h1>
${lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(l)}</p>`).join("")}
<p style="margin:24px 0"><a href="${esc(button.url)}" style="background:#4d5bc4;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${esc(button.label)}</a></p>
<p style="font-size:13px;color:#5f6675;word-break:break-all">${esc(button.url)}</p>
<p style="font-size:13px;color:#5f6675;margin-top:24px">${esc(foot)}</p></div>`;
  return { text, html };
}
