import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import SetEditor from "@/components/sets/SetEditor";
import { allWordsLight, getTextSet } from "@/lib/sets";

export const dynamic = "force-dynamic";

/** Edit the words saved from a reading text, in the same editor as study sets. */
export default async function EditTextSetPage({ params }: { params: Promise<{ id: string }> }) {
  const [set, saved] = await Promise.all([getTextSet(Number((await params).id) || 0), allWordsLight()]);
  if (!set) notFound();
  return (
    <Shell>
      <SetEditor textId={set.id} initial={{ ...set, description: null }} saved={saved} />
    </Shell>
  );
}
