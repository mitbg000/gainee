"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A thin bar at the top from the click on a link until the next page shows, and while a button's request to the
 * server (save, delete, mark…) takes more than a moment. Pages are made on the server (about a second through the
 * proxy), and without it a click looked like it did nothing.
 */
export default function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(0);

  // the new page is here
  useEffect(() => setBusy(false), [pathname, search]);

  useEffect(() => {
    let stop: ReturnType<typeof setTimeout> | undefined;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setBusy(true);
      clearTimeout(stop);
      stop = setTimeout(() => setBusy(false), 15_000); // never stuck if a navigation is cancelled
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimeout(stop);
    };
  }, []);

  // requests that change something (not GET), shown after 300 ms so quick ones do not flicker
  useEffect(() => {
    const plain = window.fetch;
    window.fetch = (input, init) => {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const p = plain.call(window, input, init);
      if (method === "GET" || method === "HEAD") return p;
      let shown = false;
      const show = setTimeout(() => {
        shown = true;
        setSending((n) => n + 1);
      }, 300);
      const done = () => {
        clearTimeout(show);
        if (shown) setSending((n) => Math.max(0, n - 1));
      };
      // shortcut: the bar ends when the response headers arrive, not when a streamed body finishes
      p.then(done, done);
      return p;
    };
    return () => {
      window.fetch = plain;
    };
  }, []);

  return busy || sending > 0 ? <div role="progressbar" aria-label="Loading" className="nav-progress" /> : null;
}
