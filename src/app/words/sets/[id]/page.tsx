import { redirect } from "next/navigation";

/** A set opens in the notebook (its words, learn, edit). */
export default async function SetPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/words?src=set:${Number((await params).id) || 0}`);
}
