import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { addWord, WordInput } from "@/lib/words";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const [data, err] = await parseBody(req, WordInput);
  if (err) return err;
  try {
    return NextResponse.json({ id: await addWord(data) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
