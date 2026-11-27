import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { getProfile, Profile, setProfile } from "@/lib/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getProfile());
}

export async function PUT(req: Request) {
  const [data, err] = await parseBody(req, Profile);
  if (err) return err;
  await setProfile(data);
  return NextResponse.json(data);
}
