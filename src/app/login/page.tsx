import AuthShell from "@/components/auth/AuthShell";
import { getCreditConfig } from "@/lib/credits";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const signup = (await getCreditConfig().catch(() => null))?.allowSignup ?? false;
  return (
    <AuthShell>
      <LoginForm signup={signup} />
    </AuthShell>
  );
}
