import { getTheme } from "@/theme/server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <LoginForm theme={await getTheme()} />
    </main>
  );
}
