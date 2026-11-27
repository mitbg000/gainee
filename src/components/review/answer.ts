import { norm } from "@/components/practice/questions";

const meaningOf = (c: { meaningVi: string | null; definitionEn: string | null }) => (c.meaningVi || c.definitionEn || "").trim();

/** A typed answer: the word (an inflected form too), or one of its meanings ("a, b; c" → a | b | c). */
export function answerOk(typed: string, c: { term: string; meaningVi: string | null; definitionEn: string | null }, ask: "en" | "vi") {
  const t = norm(typed);
  if (!t) return false;
  if (ask === "vi") return t === norm(c.term) || (t.startsWith(norm(c.term)) && t.length - c.term.length <= 3);
  const parts = meaningOf(c)
    .split(/[,;/()]|\bor\b|\bhoặc\b/)
    .map((p) => norm(p))
    .filter((p) => p.length > 1);
  return parts.some((p) => p === t || (t.length >= 3 && (p.includes(t) || t.includes(p))));
}
