import { getCreditConfig } from "@/lib/credits";
import { getTheme } from "@/theme/server";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const signup = (await getCreditConfig().catch(() => null))?.allowSignup ?? false;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <LoginForm theme={await getTheme()} signup={signup} />
    </main>
  );
}
