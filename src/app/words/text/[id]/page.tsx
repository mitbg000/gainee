import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import SetView from "@/components/sets/SetView";
import { allWordsLight, getTextSet } from "@/lib/sets";

export const dynamic = "force-dynamic";

/** The words saved from one reading text, shown as a ready-made study set. */
export default async function TextSetPage({ params }: { params: Promise<{ id: string }> }) {
  const [set, all] = await Promise.all([getTextSet(Number((await params).id) || 0), allWordsLight()]);
  if (!set) notFound();
  return (
    <Shell>
      <SetView docId={set.id} title={set.title} cards={set.cards} all={all.map((w) => ({ term: w.term, meaning: w.meaningVi || w.definitionEn || "" }))} />
    </Shell>
  );
}
