import { NextResponse } from "next/server";
import { bad, parseBody } from "@/lib/api";
import { ChatBody, ChatId, deleteChat, getChat, saveChat } from "@/lib/chats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const idOf = async (ctx: Ctx) => {
  const r = ChatId.safeParse((await ctx.params).id);
  return r.success ? r.data : null;
};

export async function GET(_req: Request, ctx: Ctx) {
  const id = await idOf(ctx);
  const c = id ? await getChat(id) : null;
  return c ? NextResponse.json(c) : bad("not_found", 404);
}

export async function PUT(req: Request, ctx: Ctx) {
  const id = await idOf(ctx);
  if (!id) return bad("invalid");
  const [data, err] = await parseBody(req, ChatBody);
  if (err) return err;
  await saveChat(id, data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = await idOf(ctx);
  if (!id) return bad("invalid");
  await deleteChat(id);
  return NextResponse.json({ ok: true });
}
