import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import DocumentView from "@/components/library/DocumentView";
import { getDocument } from "@/lib/documents/queries";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const doc = await getDocument(Number((await params).id));
  if (!doc) notFound();
  return (
    <Shell>
      <DocumentView initial={JSON.parse(JSON.stringify(doc))} />
    </Shell>
  );
}
