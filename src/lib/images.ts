/** Image uploads: type sniffing, storage and the media table. */
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { removeUpload, saveUpload } from "./storage";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIME = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" } as const;

/** Detect the image type from its first bytes (never trust the client's content type). SVG is refused on purpose. */
export function sniff(b: Uint8Array): keyof typeof MIME | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

/** Public URL of a stored image (served by /api/images/[...path]). */
export const imageUrl = (path: string) => `/api/${path}`;

/** Save an uploaded file as a word image; returns null if it is not a supported image. */
export async function addWordImage(wordId: number, file: File) {
  if (file.size > MAX_IMAGE_BYTES) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniff(bytes);
  if (!ext) return null;
  const path = await saveUpload(bytes, "images", ext);
  const db = getDb();
  const [{ id }] = await db.insert(schema.media).values({ kind: "image", path, mime: MIME[ext], bytes: bytes.length, source: "upload" }).$returningId();
  const existing = await db.select({ p: schema.wordMedia.position }).from(schema.wordMedia).where(eq(schema.wordMedia.wordId, wordId));
  await db.insert(schema.wordMedia).values({ wordId, mediaId: id, position: existing.length });
  return { id, url: imageUrl(path) };
}

export async function removeWordImage(mediaId: number) {
  const db = getDb();
  const [m] = await db.select({ path: schema.media.path }).from(schema.media).where(eq(schema.media.id, mediaId));
  await db.delete(schema.media).where(eq(schema.media.id, mediaId)); // cascades to word_media
  await removeUpload(m?.path);
}

/** wordId → [{id, url}] for the given words. */
export async function imagesForWords(ids: number[]): Promise<Map<number, { id: number; url: string }[]>> {
  const out = new Map<number, { id: number; url: string }[]>();
  if (!ids.length) return out;
  const rows = await getDb()
    .select({ wordId: schema.wordMedia.wordId, id: schema.media.id, path: schema.media.path })
    .from(schema.wordMedia)
    .innerJoin(schema.media, eq(schema.media.id, schema.wordMedia.mediaId))
    .where(inArray(schema.wordMedia.wordId, ids))
    .orderBy(asc(schema.wordMedia.position));
  for (const r of rows) out.set(r.wordId, [...(out.get(r.wordId) ?? []), { id: r.id, url: imageUrl(r.path) }]);
  return out;
}
