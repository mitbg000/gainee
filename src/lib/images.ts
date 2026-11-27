/** Image uploads: type sniffing, storage and the media table. */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { myId } from "@/lib/owner";
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

/** Longest side kept: plenty for a flashcard, a word card or a Task 1 diagram on a large screen. */
const MAX_SIDE = 1600;

/**
 * Shrink an uploaded picture to what the app needs: at most 1600 px on the longest side, WebP quality 80,
 * phone photos turned upright, camera metadata (GPS…) dropped. GIFs are kept as they are (they may be animated),
 * and the original is kept when the result would not be smaller or the image library is unavailable.
 */
export async function optimizeImage(bytes: Uint8Array, ext: keyof typeof MIME): Promise<{ bytes: Uint8Array; ext: keyof typeof MIME }> {
  if (ext === "gif") return { bytes, ext };
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(bytes, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return out.length < bytes.length ? { bytes: new Uint8Array(out), ext: "webp" } : { bytes, ext };
  } catch {
    return { bytes, ext };
  }
}

/** Optimise, then store under images/; returns the path relative to the upload folder and the stored type. */
export async function saveImage(bytes: Uint8Array, ext: keyof typeof MIME) {
  const img = await optimizeImage(bytes, ext);
  return { path: await saveUpload(img.bytes, "images", img.ext), ext: img.ext, size: img.bytes.length };
}

/** Public URL of a stored image (served by /api/images/[...path]). */
export const imageUrl = (path: string) => `/api/${path}`;

/** Save an uploaded file as a word image; returns null if it is not a supported image. */
export async function addWordImage(wordId: number, file: File) {
  if (file.size > MAX_IMAGE_BYTES) return null;
  const [own] = await getDb().select({ id: schema.words.id }).from(schema.words).where(and(eq(schema.words.id, wordId), eq(schema.words.userId, await myId())));
  if (!own) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniff(bytes);
  if (!ext) return null;
  const img = await saveImage(bytes, ext);
  const path = img.path;
  const db = getDb();
  const [{ id }] = await db.insert(schema.media).values({ kind: "image", path, mime: MIME[img.ext], bytes: img.size, source: "upload" }).$returningId();
  const existing = await db.select({ p: schema.wordMedia.position }).from(schema.wordMedia).where(eq(schema.wordMedia.wordId, wordId));
  await db.insert(schema.wordMedia).values({ wordId, mediaId: id, position: existing.length });
  return { id, url: imageUrl(path) };
}

export async function removeWordImage(mediaId: number) {
  const db = getDb();
  const [m] = await db
    .select({ path: schema.media.path })
    .from(schema.media)
    .innerJoin(schema.wordMedia, eq(schema.wordMedia.mediaId, schema.media.id))
    .innerJoin(schema.words, eq(schema.words.id, schema.wordMedia.wordId))
    .where(and(eq(schema.media.id, mediaId), eq(schema.words.userId, await myId())));
  if (!m) return;
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
