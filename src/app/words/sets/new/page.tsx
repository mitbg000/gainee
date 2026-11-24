import Shell from "@/components/Shell";
import SetEditor from "@/components/sets/SetEditor";
import { allWordsLight } from "@/lib/sets";

export const dynamic = "force-dynamic";

export default async function NewSetPage() {
  return (
    <Shell>
      <SetEditor saved={await allWordsLight()} />
    </Shell>
  );
}
