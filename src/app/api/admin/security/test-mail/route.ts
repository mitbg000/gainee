import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { sendMail, simpleMail } from "@/lib/mail";
import { getSecurity } from "@/lib/security";
import { requireRole } from "@/lib/users";

export const runtime = "nodejs";

/** Send a test e-mail with the saved SMTP settings (to the given address, else the admin's own). */
export async function POST(req: Request) {
  const me = await requireRole("admin");
  if (!me) return bad("forbidden", 403);
  const [d, err] = await parseBody(req, z.object({ to: z.string().trim().email().max(191).optional() }));
  if (err) return err;
  const to = d.to || (me.email.includes("@") ? me.email : "");
  if (!to) return bad("no_email");
  try {
    const { siteUrl } = await getSecurity();
    const m = simpleMail("Gainee: test e-mail", ["SMTP works: this message was sent with the saved settings."], { label: "Gainee", url: siteUrl || "https://example.com" }, "");
    await sendMail(to, "Gainee: test e-mail", m.text, m.html);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad(e instanceof Error ? e.message.slice(0, 300) : "send_failed", 502);
  }
}
