"use client";
import { useState } from "react";
import { IconBook } from "@/components/icons";

/** Search box over the server-rendered book list: hides `[data-book]` rows whose title does not match and opens the ones that do. */
export default function BookFilter({ placeholder }: { placeholder: string }) {
  const [q, setQ] = useState("");
  const filter = (v: string) => {
    setQ(v);
    const words = v.toLowerCase().split(/\s+/).filter(Boolean);
    document.querySelectorAll<HTMLDetailsElement>("details[data-book]").forEach((el) => {
      const hit = words.every((w) => el.dataset.book!.toLowerCase().includes(w));
      el.hidden = !hit;
      if (words.length && hit) el.open = true;
    });
  };
  return (
    <label className="relative mt-6 block max-w-sm">
      <IconBook className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input type="search" value={q} onChange={(e) => filter(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="field pl-9" />
    </label>
  );
}
