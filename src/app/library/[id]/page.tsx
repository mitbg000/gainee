import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import Shell from "@/components/Shell";
import DocumentView from "@/components/library/DocumentView";
import { getDb, schema } from "@/db";
import { getDocument } from "@/lib/documents/queries";
import { isEditor } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const doc = await getDocument(Number((await params).id));
  if (!doc) notFound();
  // editors and admins may show their texts to learners (all, or chosen groups)
  const groups = doc.canEdit && (await isEditor()) ? await getDb().select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).orderBy(asc(schema.groups.name)) : undefined;
  return (
    <Shell>
      <DocumentView initial={JSON.parse(JSON.stringify(doc))} groups={groups} />
    </Shell>
  );
}
