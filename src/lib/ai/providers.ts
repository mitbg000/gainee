/** AI provider records (API keys are stored encrypted). */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { decrypt, encrypt, maskKey } from "@/lib/crypto";
import { PROVIDER_PRESETS } from "./tasks";

const { aiProviders } = schema;
export type ProviderRow = typeof aiProviders.$inferSelect;
export type ProviderPublic = Omit<ProviderRow, "apiKeyEnc"> & { keyPreview: string };

export const ProviderInput = z.object({
  name: z.enum(Object.keys(PROVIDER_PRESETS) as [keyof typeof PROVIDER_PRESETS, ...(keyof typeof PROVIDER_PRESETS)[]]),
  label: z.string().trim().min(1).max(100),
  baseUrl: z.string().trim().url().max(500),
  apiKey: z.string().trim().min(8).max(500),
  defaultModel: z.string().trim().min(1).max(100),
  enabled: z.boolean().default(true),
});
export const ProviderPatch = ProviderInput.partial();

function toPublic(p: ProviderRow): ProviderPublic {
  const { apiKeyEnc, ...rest } = p;
  let keyPreview = "••••";
  try {
    keyPreview = maskKey(decrypt(apiKeyEnc));
  } catch {
    keyPreview = "⚠ cannot decrypt";
  }
  return { ...rest, keyPreview };
}

export async function listProviders(): Promise<ProviderPublic[]> {
  const rows = await getDb().select().from(aiProviders).orderBy(asc(aiProviders.id));
  return rows.map(toPublic);
}

export async function getProvider(id: number): Promise<(ProviderRow & { apiKey: string }) | undefined> {
  const [row] = await getDb().select().from(aiProviders).where(eq(aiProviders.id, id));
  return row ? { ...row, apiKey: decrypt(row.apiKeyEnc) } : undefined;
}

export async function createProvider(input: z.infer<typeof ProviderInput>) {
  const { apiKey, ...rest } = input;
  const [{ id }] = await getDb()
    .insert(aiProviders)
    .values({ ...rest, baseUrl: rest.baseUrl.replace(/\/+$/, ""), apiKeyEnc: encrypt(apiKey) })
    .$returningId();
  return id;
}

export async function updateProvider(id: number, patch: z.infer<typeof ProviderPatch>) {
  const { apiKey, ...rest } = patch;
  await getDb()
    .update(aiProviders)
    .set({
      ...rest,
      ...(rest.baseUrl ? { baseUrl: rest.baseUrl.replace(/\/+$/, "") } : {}),
      ...(apiKey ? { apiKeyEnc: encrypt(apiKey) } : {}),
    })
    .where(eq(aiProviders.id, id));
}

export async function deleteProvider(id: number) {
  await getDb().delete(aiProviders).where(eq(aiProviders.id, id));
}
