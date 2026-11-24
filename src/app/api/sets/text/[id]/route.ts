import { NextResponse } from "next/server";
import { bad, idParam, parseBody } from "@/lib/api";
import { saveTextSet, TextSetInput } from "@/lib/sets";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Replace the cards of a reading text's word list: { cards } → { id, wordIds } */
export async function PUT(req: Request, { params }: Ctx) {
  const id = idParam((await params).id);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, TextSetInput);
  if (err) return err;
  const r = await saveTextSet(id, data.cards);
  return r ? NextResponse.json(r) : bad("not_found", 404);
}
