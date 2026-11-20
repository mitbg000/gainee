import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { lemmaCandidates, lookupKey } from "./normalize";

export type DictResult = {
  query: string;
  matched: string | null; // the form that was found
  via: "exact" | "alias" | "lemma" | null;
  entries: { id: number; headword: string; html: string }[];
};

const { dictEntries, dictAliases } = schema;

async function byKeys(keys: string[]) {
  if (!keys.length) return [];
  return getDb()
    .select({ id: dictEntries.id, headword: dictEntries.headword, html: dictEntries.html, key: dictEntries.lookupKey })
    .from(dictEntries)
    .where(inArray(dictEntries.lookupKey, keys))
    .limit(20);
}

async function byAlias(key: string) {
  const db = getDb();
  return db
    .select({ id: dictEntries.id, headword: dictEntries.headword, html: dictEntries.html })
    .from(dictAliases)
    .innerJoin(dictEntries, and(eq(dictAliases.entryId, dictEntries.id)))
    .where(eq(dictAliases.lookupKey, key))
    .limit(10);
}

/** Exact headword → StarDict alias (inflection) → rule-based lemma. No AI involved. */
export async function lookup(query: string): Promise<DictResult> {
  const key = lookupKey(query);
  const empty: DictResult = { query, matched: null, via: null, entries: [] };
  if (!key) return empty;

  const exact = await byKeys([key]);
  if (exact.length) return { query, matched: key, via: "exact", entries: exact };

  const alias = await byAlias(key);
  if (alias.length) return { query, matched: alias[0].headword, via: "alias", entries: dedupe(alias) };

  const candidates = lemmaCandidates(key);
  const lemma = await byKeys(candidates);
  if (lemma.length) {
    // keep the most likely candidate first (order of lemmaCandidates)
    const best = candidates.find((c) => lemma.some((e) => e.key === c))!;
    return { query, matched: best, via: "lemma", entries: lemma.filter((e) => e.key === best) };
  }
  return empty;
}

function dedupe<T extends { id: number }>(rows: T[]): T[] {
  const seen = new Set<number>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}
