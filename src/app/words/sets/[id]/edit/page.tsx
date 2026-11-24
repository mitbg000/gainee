import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import SetEditor from "@/components/sets/SetEditor";
import { allWordsLight, getSet } from "@/lib/sets";

export const dynamic = "force-dynamic";

export default async function EditSetPage({ params }: { params: Promise<{ id: string }> }) {
  const [set, saved] = await Promise.all([getSet(Number((await params).id) || 0), allWordsLight()]);
  if (!set) notFound();
  return (
    <Shell>
      <SetEditor initial={set} saved={saved} />
    </Shell>
  );
}
