"use client";

import { useEffect } from "react";

/** A page that broke in the browser. Right after a deploy that is mostly an old page asking for files the new
 *  version replaced: reload once, by itself. Anything else: say so, with a reload button. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = /ChunkLoadError|Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(`${error.name} ${error.message}`);
  useEffect(() => {
    if (!stale) return;
    try {
      if (sessionStorage.getItem("reloaded_for_chunk")) return;
      sessionStorage.setItem("reloaded_for_chunk", "1");
    } catch {}
    location.reload();
  }, [stale]);

  return (
    <div className="mx-auto mt-24 max-w-md px-4 text-center">
      <p className="font-serif text-2xl font-bold">Có lỗi khi mở trang</p>
      <p className="mt-2 text-sm text-muted">Something went wrong while opening this page.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={() => location.reload()} className="btn btn-primary">
          Tải lại / Reload
        </button>
        <button onClick={reset} className="btn btn-secondary">
          Thử lại / Try again
        </button>
      </div>
    </div>
  );
}
