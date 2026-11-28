import { NextResponse, type NextRequest } from "next/server";
import { bad, parseBody } from "@/lib/api";
import { deleteSource, saveSourceSet } from "@/lib/notebook";
import { TextSetInput } from "@/lib/sets";

export const runtime = "nodejs";

const keyOf = (req: NextRequest) => req.nextUrl.searchParams.get("src") ?? "";

/** Replace the cards of an automatic set (?src=text:7 | listen:12 | ielts:5 | other): { cards } → { id, wordIds } */
export async function PUT(req: NextRequest) {
  const [data, err] = await parseBody(req, TextSetInput);
  if (err) return err;
  const r = await saveSourceSet(keyOf(req), data.cards);
  return r ? NextResponse.json(r) : bad("not_found", 404);
}

/** Delete a set by its key (see lib/notebook deleteSource for what happens to the words). */
export async function DELETE(req: NextRequest) {
  const key = keyOf(req);
  if (!/^(set|text|listen|ielts):\d+$|^other$/.test(key)) return bad("invalid");
  await deleteSource(key);
  return NextResponse.json({ ok: true });
}
