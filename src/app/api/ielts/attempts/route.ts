import { NextResponse } from "next/server";
import { bad, parseBody } from "@/lib/api";
import { AttemptInput, saveAttempt } from "@/lib/ielts/queries";

export const runtime = "nodejs";

/** Submit a mock test or a practice round → { id } of the marked attempt. */
export async function POST(req: Request) {
  const [data, err] = await parseBody(req, AttemptInput);
  if (err) return err;
  const id = await saveAttempt(data);
  return id ? NextResponse.json({ id }, { status: 201 }) : bad("not_found", 404);
}
