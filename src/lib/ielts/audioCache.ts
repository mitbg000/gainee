/**
 * Whole recording as a local blob: URL, so seeking always works. Some proxies in front of the app (aaPanel's Nginx
 * cache, Cloudflare) answer range requests with the whole file, and then a browser cannot jump to a part's mark.
 * The file is kept in the browser's Cache Storage ("rl-pages-…" so logging out removes it): the next time it opens at once.
 */
const CACHE = "rl-pages-audio";
const urls = new Map<string, Promise<string>>();

async function download(src: string, onProgress?: (pct: number) => void): Promise<Blob> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(src);
    if (hit) return await hit.blob();
  } catch {
    cache = null; // no Cache Storage (private window, http): download every time
  }
  const res = await fetch(src);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onProgress?.(got / total);
  }
  const blob = new Blob(parts as BlobPart[], { type: res.headers.get("content-type") ?? "audio/mpeg" });
  await cache?.put(src, new Response(blob, { headers: { "content-type": blob.type } })).catch(() => {});
  return blob;
}

/** blob: URL for a recording (shared by every player on the page). */
export function localAudio(src: string, onProgress?: (pct: number) => void): Promise<string> {
  let p = urls.get(src);
  if (!p) {
    p = download(src, onProgress).then((b) => URL.createObjectURL(b));
    p.catch(() => urls.delete(src));
    urls.set(src, p);
  }
  return p;
}
