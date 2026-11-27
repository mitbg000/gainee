import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { sendMail, simpleMail } from "@/lib/mail";
import { getSecurity } from "@/lib/security";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";

/** Send a test e-mail to the admin's own address with the saved SMTP settings. */
export async function POST() {
  const me = await requireRole("admin");
  if (!me) return bad("forbidden", 403);
  if (!me.email.includes("@")) return bad("no_email");
  try {
    const { siteUrl } = await getSecurity();
    const m = simpleMail("Gainee: test e-mail", ["SMTP works: this message was sent with the saved settings."], { label: "Gainee", url: siteUrl || "https://example.com" }, "");
    await sendMail(me.email, "Gainee: test e-mail", m.text, m.html);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad(e instanceof Error ? e.message.slice(0, 300) : "send_failed", 502);
  }
}
