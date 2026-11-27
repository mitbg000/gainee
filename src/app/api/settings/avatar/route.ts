import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { bad } from "@/lib/api";
import { imageUrl, MAX_IMAGE_BYTES, saveImage, sniff } from "@/lib/images";
import { removeUpload } from "@/lib/storage";
import { currentUser } from "@/lib/users";

export const runtime = "nodejs";

/** The user's own picture (multipart field "file"); the old one is removed. */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return bad("unauthorized", 401);
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || file.size > MAX_IMAGE_BYTES) return bad("invalid");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniff(bytes);
  if (!ext) return bad("not_an_image");
  const img = await saveImage(bytes, ext);
  await getDb().update(schema.users).set({ avatar: img.path }).where(eq(schema.users.id, u.id));
  await removeUpload(u.avatar);
  return NextResponse.json({ url: imageUrl(img.path) });
}

export async function DELETE() {
  const u = await currentUser();
  if (!u) return bad("unauthorized", 401);
  await getDb().update(schema.users).set({ avatar: null }).where(eq(schema.users.id, u.id));
  await removeUpload(u.avatar);
  return NextResponse.json({ ok: true });
}
