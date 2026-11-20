import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { saveWriting, WritingInput } from "@/lib/writing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const [data, err] = await parseBody(req, WritingInput);
  if (err) return err;
  return NextResponse.json({ id: await saveWriting(null, data) }, { status: 201 });
}
