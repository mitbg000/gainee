import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true, time: new Date().toISOString() });
  } catch (e) {
    console.error("health check failed:", e); // details only in the server log; this route is public
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
