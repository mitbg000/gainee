import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import SetView from "@/components/sets/SetView";
import { allWordsLight, getSet } from "@/lib/sets";

export const dynamic = "force-dynamic";

export default async function SetPage({ params }: { params: Promise<{ id: string }> }) {
  const [set, all] = await Promise.all([getSet(Number((await params).id) || 0), allWordsLight()]);
  if (!set) notFound();
  return (
    <Shell>
      <SetView setId={set.id} title={set.title} description={set.description} cards={set.cards} all={all.map((w) => ({ term: w.term, meaning: w.meaningVi || w.definitionEn || "" }))} />
    </Shell>
  );
}
