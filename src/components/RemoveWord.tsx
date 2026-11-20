"use client";

import { useRouter } from "next/navigation";

export default function RemoveWord({ id, label }: { id: number; label: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch(`/api/words/${id}`, { method: "DELETE" });
        router.refresh();
      }}
      className="min-h-9 rounded-lg border border-line px-3 text-sm text-muted hover:text-ink"
    >
      {label}
    </button>
  );
}
