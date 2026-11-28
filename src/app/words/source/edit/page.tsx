import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import SetEditor from "@/components/sets/SetEditor";
import { sourceCards } from "@/lib/notebook";
import { allWordsLight } from "@/lib/sets";

export const dynamic = "force-dynamic";

/** Edit the words of an automatic set (a video, an IELTS test, other words) in the set editor. */
export default async function EditSourcePage({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const key = (await searchParams).src ?? "";
  const [set, saved] = await Promise.all([sourceCards(key), allWordsLight()]);
  if (!set) notFound();
  return (
    <Shell>
      <SetEditor sourceKey={key} initial={{ id: 0, title: set.title, description: null, cards: set.cards }} saved={saved} />
    </Shell>
  );
}
