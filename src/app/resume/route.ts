import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/** PWA start page: reopen the lesson that was being read (cookie set by the reader), else the dashboard. */
export async function GET() {
  const id = Number((await cookies()).get("last_lesson")?.value);
  // relative Location: behind the proxy the request URL would carry the internal host
  return new Response(null, { status: 307, headers: { Location: Number.isInteger(id) && id > 0 ? `/lessons/${id}` : "/" } });
}
