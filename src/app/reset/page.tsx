import AuthShell from "@/components/auth/AuthShell";
import { tokenUser } from "@/lib/passwordReset";
import ResetForm from "./ResetForm";

export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const ok = token.length >= 20 && token.length <= 200 && !!(await tokenUser(token));
  return (
    <AuthShell>
      <ResetForm token={ok ? token : null} />
    </AuthShell>
  );
}
