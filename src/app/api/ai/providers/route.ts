import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { createProvider, listProviders, ProviderInput } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listProviders());
}

export async function POST(req: Request) {
  const [data, err] = await parseBody(req, ProviderInput);
  if (err) return err;
  return NextResponse.json({ id: await createProvider(data) }, { status: 201 });
}
