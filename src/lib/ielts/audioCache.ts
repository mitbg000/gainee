/**
 * Whole recording as a local blob: URL, so seeking always works. Some proxies in front of the app (aaPanel's Nginx
 * cache, Cloudflare) answer range requests with the whole file, and then a browser cannot jump to a part's mark.
 * The file is kept in the browser's Cache Storage ("rl-pages-…" so logging out removes it): the next time it opens at once.
 */
const CACHE = "rl-pages-audio";
const urls = new Map<string, Promise<string>>();
const STALL = 60_000;

async function download(src: string, onProgress?: (pct: number) => void, size = 0): Promise<Blob> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(src);
    if (hit) return await hit.blob();
  } catch {
    cache = null; // no Cache Storage (private window, http): download every time
  }
  // a download that gets no data for a minute is stopped with an error instead of waiting forever
  const ctl = new AbortController();
  let timer = setTimeout(() => ctl.abort(), STALL);
  const res = await fetch(src, { signal: ctl.signal }).catch((e) => {
    throw ctl.signal.aborted ? new Error("download_stalled") : e;
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  // a proxy may drop the length header: the size stored with the file is used then
  const total = Number(res.headers.get("content-length")) || size;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read().catch((e) => {
      throw ctl.signal.aborted ? new Error("download_stalled") : e;
    });
    clearTimeout(timer);
    if (!done) timer = setTimeout(() => ctl.abort(), STALL);
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onProgress?.(got / total);
  }
  // a connection cut part way must not leave a broken copy in the cache (it would be used every time after)
  if (total && got < total) throw new Error("download_incomplete");
  const blob = new Blob(parts as BlobPart[], { type: res.headers.get("content-type") ?? "audio/mpeg" });
  await cache?.put(src, new Response(blob, { headers: { "content-type": blob.type } })).catch(() => {});
  return blob;
}

/** blob: URL for a recording (shared by every player on the page). */
export function localAudio(src: string, onProgress?: (pct: number) => void, size?: number): Promise<string> {
  let p = urls.get(src);
  if (!p) {
    p = download(src, onProgress, size).then((b) => URL.createObjectURL(b));
    p.catch(() => urls.delete(src));
    urls.set(src, p);
  }
  return p;
}
