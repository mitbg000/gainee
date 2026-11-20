import type { RichPara } from "@/lib/text/rich";
import { segments } from "./marks";

/** Read-only rendering of one paragraph (bold/italic, heading or image), without highlights. */
export default function RichBlock({ block }: { block: RichPara }) {
  if (block.kind === "img")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={block.src} alt={block.alt ?? ""} loading="lazy" className="mx-auto my-4 max-h-96 max-w-full rounded-xl" />;
  const marks = block.styles.map((s) => ({ start: s.start, end: s.end, kind: "fmt" as const, id: 0, color: s.kind }));
  return (
    <p className={block.kind === "h" ? "mb-[0.7em] mt-[1.4em] font-sans text-[1.15em] font-bold" : "mb-[1.1em]"}>
      {segments(block.text, marks).map((seg) => {
        const b = seg.marks.some((m) => m.color === "b");
        const i = seg.marks.some((m) => m.color === "i");
        return b || i ? (
          <span key={seg.start} className={`${b ? "font-bold" : ""} ${i ? "italic" : ""}`}>
            {seg.text}
          </span>
        ) : (
          seg.text
        );
      })}
    </p>
  );
}
