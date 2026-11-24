import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { saveSet, SetInput } from "@/lib/sets";

export const runtime = "nodejs";

/** Create a study set: { title, description?, cards? | wordIds? } → { id } */
export async function POST(req: Request) {
  const [data, err] = await parseBody(req, SetInput);
  if (err) return err;
  return NextResponse.json({ id: await saveSet(null, data) }, { status: 201 });
}
