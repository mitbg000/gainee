import { CHIP, type LabelColor } from "./colors";

export default function LabelChip({ name, emoji, color, className = "" }: { name: string; emoji?: string | null; color: LabelColor; className?: string }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ${CHIP[color]} ${className}`}>
      {emoji && <span aria-hidden>{emoji}</span>}
      <span className="truncate">{name}</span>
    </span>
  );
}
