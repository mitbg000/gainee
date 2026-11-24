/** Log out in the browser: end the session, drop the pages the service worker kept for offline use, go to the login page. */
export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
  try {
    // only cached pages (they hold your data); the static app files stay for a fast next start
    for (const k of await caches.keys()) if (k.startsWith("rl-pages")) await caches.delete(k);
  } catch {}
  location.href = "/login";
}
