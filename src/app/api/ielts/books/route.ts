import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { createBook } from "@/lib/ielts/queries";

export const runtime = "nodejs";

/** Start an upload: { title, pageCount } → { id }. Pages and audio follow in separate requests. */
export async function POST(req: Request) {
  const [data, err] = await parseBody(req, z.object({ title: z.string().trim().min(1).max(191), pageCount: z.number().int().min(1).max(600) }));
  if (err) return err;
  return NextResponse.json({ id: await createBook(data.title, data.pageCount) }, { status: 201 });
}
